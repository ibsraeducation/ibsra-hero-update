/* ==========================================================================
   Store ↔ Supabase.

   The store stays the UI's source of truth and keeps its synchronous
   actions. This module listens to it and sends what changed:
     admin   — programs, courses and whole sessions (with their answer keys)
     student — the steps they tick off
   Demo people, cohorts and products are never sent anywhere.

   Changes are coalesced per item and sent through one serial queue a moment
   after the last edit (5 s at most), built from the store as it is when they
   go out. A network drop is retried; a refusal (permission, a conflict with
   another tab, a delete the database blocks) stops, reloads the server copy
   into the store and says so — that reload is the rollback.
   ========================================================================== */

import { useStore } from '@/lib/store'
import { useAuthStore } from '@/lib/authStore'
import * as api from '@/lib/api/content'
import { addSteps, fetchMyProgress, removeSteps } from '@/lib/api/progress'
import { fetchMySubmissions, useSubmissions } from '@/lib/api/submissions'
import { isTransient, retryClockSkew, toMessage } from '@/lib/api/errors'
import type { AppRole } from '@/lib/api/rows'
import type { DB } from '@/lib/types'
import { diffContent, diffDone, isEmptyDiff, tooManyRemovals, type Done } from './diff'
import { useSyncStatus } from './status'

type Op = 'upsert' | 'remove'
interface Entry<T> { op: T; v: number }

let version = 0
const ops = {
  track: new Map<string, Entry<Op>>(),
  loop: new Map<string, Entry<Op>>(),
  session: new Map<string, Entry<Op>>(),
}
const stepOps = new Map<string, Entry<'add' | 'remove'> & { sessionId: string; key: string }>()
/** Session id → the revision our copy is based on. Missing = not on the server yet. */
const revs = new Map<string, number>()

let role: AppRole | null = null
let paused = true
let unsubscribe: (() => void) | null = null
let timer: number | undefined
let retryTimer: number | undefined
let firstDirtyAt = 0
let flushing: Promise<void> | null = null
let again = false
let attempt = 0
let lastFetchAt = 0

const pendingCount = () => ops.track.size + ops.loop.size + ops.session.size + stepOps.size
const refreshPending = () => useSyncStatus.setState({ pending: pendingCount() })

function clearOps() {
  ops.track.clear(); ops.loop.clear(); ops.session.clear(); stepOps.clear()
  clearTimeout(timer); clearTimeout(retryTimer)
  timer = retryTimer = undefined
  firstDirtyAt = 0
  attempt = 0
  refreshPending()
}

/* ---------------- listening ---------------- */

function onContent(prev: DB, next: DB) {
  if (prev.tracks === next.tracks && prev.loops === next.loops && prev.sessions === next.sessions) return
  const d = diffContent(prev, next)
  if (isEmptyDiff(d)) return
  if (tooManyRemovals(d)) {
    void recover('That removed too much at once, so nothing was saved. The latest copy was reloaded.')
    return
  }
  const mark = (map: Map<string, Entry<Op>>, id: string, op: Op) => map.set(id, { op, v: ++version })
  d.tracks.upsert.forEach(t => mark(ops.track, t.id, 'upsert'))
  d.tracks.remove.forEach(id => mark(ops.track, id, 'remove'))
  d.loops.upsert.forEach(l => mark(ops.loop, l.id, 'upsert'))
  d.loops.remove.forEach(id => mark(ops.loop, id, 'remove'))
  d.sessions.upsert.forEach(s => mark(ops.session, s.id, 'upsert'))
  d.sessions.remove.forEach(id => mark(ops.session, id, 'remove'))
  schedule(d.sessions.upsert.length > 0)
}

function onDone(prev: Done, next: Done) {
  const { add, remove } = diffDone(prev, next)
  if (!add.length && !remove.length) return
  for (const c of add) stepOps.set(`${c.sessionId}|${c.key}`, { ...c, op: 'add', v: ++version })
  for (const c of remove) stepOps.set(`${c.sessionId}|${c.key}`, { ...c, op: 'remove', v: ++version })
  schedule(false)
}

function schedule(slow: boolean) {
  refreshPending()
  const now = Date.now()
  if (!firstDirtyAt) firstDirtyAt = now
  clearTimeout(timer)
  const wait = Math.max(0, Math.min(slow ? 800 : 400, firstDirtyAt + 5000 - now))
  timer = window.setTimeout(() => { void flush() }, wait)
}

/* ---------------- sending ---------------- */

/** Drop an entry only if nothing newer was queued for it while it was sent. */
function settle<T>(map: Map<string, Entry<T>>, id: string, e: Entry<T>) {
  if (map.get(id)?.v === e.v) map.delete(id)
}

async function pushContent() {
  const db = () => useStore.getState().db
  const take = (map: Map<string, Entry<Op>>, op: Op) => [...map.entries()].filter(([, e]) => e.op === op)

  for (const [id, e] of take(ops.track, 'upsert')) {
    const t = db().tracks.find(x => x.id === id)
    if (t) await api.upsertTrack(t)
    settle(ops.track, id, e)
  }
  for (const [id, e] of take(ops.loop, 'upsert')) {
    const l = db().loops.find(x => x.id === id)
    if (l) await api.upsertLoop(l)
    settle(ops.loop, id, e)
  }
  for (const [id, e] of take(ops.session, 'upsert')) {
    const s = db().sessions.find(x => x.id === id)
    if (s) revs.set(id, await api.saveSession(s, revs.get(id) ?? null))
    settle(ops.session, id, e)
  }
  for (const [id, e] of take(ops.session, 'remove')) {
    if (revs.has(id)) await api.deleteSession(id)
    revs.delete(id)
    settle(ops.session, id, e)
  }
  for (const [id, e] of take(ops.loop, 'remove')) {
    await api.deleteLoop(id)
    settle(ops.loop, id, e)
  }
  for (const [id, e] of take(ops.track, 'remove')) {
    await api.deleteTrack(id)
    settle(ops.track, id, e)
  }
}

async function pushSteps() {
  const studentId = useAuthStore.getState().profile?.id
  if (!studentId) return
  const entries = [...stepOps.entries()]
  const adds = entries.filter(([, e]) => e.op === 'add')
  const removes = entries.filter(([, e]) => e.op === 'remove')
  if (adds.length) {
    await addSteps(studentId, adds.map(([, e]) => ({ sessionId: e.sessionId, key: e.key })))
    adds.forEach(([k, e]) => settle(stepOps, k, e))
  }
  if (removes.length) {
    await removeSteps(studentId, removes.map(([, e]) => ({ sessionId: e.sessionId, key: e.key })))
    removes.forEach(([k, e]) => settle(stepOps, k, e))
  }
}

async function runOnce() {
  if (paused || !role || pendingCount() === 0) return
  useSyncStatus.setState({ saving: true })
  try {
    if (role === 'admin') await pushContent()
    else await pushSteps()
    attempt = 0
    useSyncStatus.setState({ saving: false, lastSavedAt: Date.now(), error: null })
  } catch (e) {
    useSyncStatus.setState({ saving: false })
    if (isTransient(e)) {
      attempt += 1
      if (attempt <= 3) {
        clearTimeout(retryTimer)
        retryTimer = window.setTimeout(() => { void flush() }, 1000 * 2 ** (attempt - 1))
      } else {
        useSyncStatus.setState({ error: toMessage(e) })
      }
    } else {
      await recover(toMessage(e))
    }
  } finally {
    refreshPending()
  }
}

/** Send everything queued now. Safe to call at any time. */
export function flush(): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  if (flushing) { again = true; return flushing }
  flushing = (async () => {
    try {
      do {
        again = false
        firstDirtyAt = 0
        await runOnce()
      } while (again && !paused)
    } finally {
      flushing = null
    }
  })()
  return flushing
}

/** The "retry" on the save badge after retries ran out. */
export function retrySync() {
  attempt = 0
  useSyncStatus.setState({ error: null })
  void flush()
}

async function recover(message: string) {
  const r = role
  if (!r) return
  paused = true
  clearOps()
  useStore.getState().toast(message, 'err')
  await hydrate(r, { quiet: true })
}

/* ---------------- loading ---------------- */

/** Replace the store's live collections with the server copy. */
export async function hydrate(r: AppRole, opts: { quiet?: boolean } = {}) {
  const profile = useAuthStore.getState().profile
  if (!profile) return
  /* A parent has nothing in the content store: their pages read their own
     rows from the server as they open. Nothing to load, nothing to push. */
  if (r === 'parent') {
    useSyncStatus.setState({ data: 'ready', dataError: null, error: null })
    return
  }
  paused = true
  if (!opts.quiet) useSyncStatus.setState({ data: 'loading', dataError: null })
  try {
    if (r === 'admin') {
      const snap = await retryClockSkew(() => api.fetchAdminContent())
      revs.clear()
      snap.revs.forEach((v, k) => revs.set(k, v))
      useStore.setState(s => ({
        db: { ...s.db, tracks: snap.tracks, loops: snap.loops, sessions: snap.sessions },
      }))
    } else {
      const [snap, done, subs, enrollments] = await retryClockSkew(() => Promise.all([
        api.fetchStudentContent(),
        fetchMyProgress(profile.id),
        fetchMySubmissions(profile.id),
        api.fetchMyEnrollments(profile.id),
      ]))
      useAuthStore.setState({ enrollments })
      useStore.setState(s => ({
        db: { ...s.db, tracks: snap.tracks, loops: snap.loops, sessions: snap.sessions },
        done,
      }))
      useSubmissions.getState().replace(subs)
    }
    lastFetchAt = Date.now()
    useSyncStatus.setState({ data: 'ready', dataError: null, error: null })
  } catch (e) {
    if (opts.quiet) useStore.getState().toast(toMessage(e), 'err')
    else useSyncStatus.setState({ data: 'error', dataError: toMessage(e) })
  } finally {
    if (role === r) paused = false
  }
}

/* ---------------- lifecycle ---------------- */

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (pendingCount() > 0 || flushing) {
    void flush()
    e.preventDefault()
    e.returnValue = ''
  }
}

function onVisibility() {
  if (document.visibilityState === 'hidden') void flush()
}

/* A student coming back to the tab picks up newly published sessions. */
function onFocus() {
  if (role !== 'student' || paused || flushing || pendingCount() > 0) return
  if (Date.now() - lastFetchAt < 60_000) return
  void hydrate('student', { quiet: true })
}

/* A notice just landed, and the thing it announces — a program opened,
   a course closed — is content this student holds in the store. Re-read it
   now rather than on the next focus, so the page they are told to look at
   already has it. The focus throttle is deliberately not applied: a notice
   is rare and means something changed. */
export function syncAfterNotice() {
  if (role !== 'student' || paused || flushing || pendingCount() > 0) return
  void hydrate('student', { quiet: true })
}

export function startSync(r: AppRole) {
  stopSync()
  role = r
  unsubscribe = useStore.subscribe((s, p) => {
    if (paused || !role) return
    if (role === 'admin' && s.db !== p.db) onContent(p.db, s.db)
    if (role === 'student' && s.done !== p.done) onDone(p.done, s.done)
  })
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onFocus)
}

export function stopSync() {
  unsubscribe?.()
  unsubscribe = null
  role = null
  paused = true
  clearOps()
  revs.clear()
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('focus', onFocus)
  useSyncStatus.setState({ saving: false, error: null, data: 'idle', dataError: null })
}

/** Send what is queued, then stop listening (sign-out). */
export async function flushAndStop() {
  try {
    if (!paused) await flush()
  } catch { /* signing out regardless */ }
  stopSync()
}

/** Empty the live collections so the next person on this browser starts clean. */
export function resetLiveData() {
  useStore.setState(s => ({ db: { ...s.db, tracks: [], loops: [], sessions: [] }, done: {} }))
  useSubmissions.getState().clear()
}
