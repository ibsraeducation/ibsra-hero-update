/* ==========================================================================
   The two things every live parent page starts from: which children are on
   this account, and which one is being looked at.

   The pick is remembered in this browser, so a family with three children
   does not re-pick on every page. It is only ever an id the account really
   owns — a stale one from an old session falls back to the first child.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchChildren } from '@/lib/api/family'
import { fetchChildProgress, fetchChildSubmissions, fetchFamilyContent, type Done } from '@/lib/api/child'
import { toMessage } from '@/lib/api/errors'
import { useAuth } from '@/lib/auth'
import type { GuardianChild, SubmissionRow } from '@/lib/api/rows'
import type { Loop, Session, Track } from '@/lib/types'

const PICK_KEY = 'ibsra.parent.child'

const readPick = () => {
  try { return localStorage.getItem(PICK_KEY) ?? '' } catch { return '' }
}
const writePick = (id: string) => {
  try { localStorage.setItem(PICK_KEY, id) } catch { /* private mode */ }
}

export interface Family {
  children: GuardianChild[] | null
  error: string | null
  /** The child being looked at, once the list has loaded. */
  child: GuardianChild | null
  pick: (id: string) => void
  /** Read the children again — after an enrolment, so a program that just
   *  opened shows without a page reload. */
  reload: () => void
}

/** Where the money pages live for whoever is signed in. A student has a
 *  wallet and pays for themself with the same pages a parent uses, mounted
 *  under `/student`. */
export function usePayArea(): '/parent' | '/student' {
  return useAuth(s => s.profile?.role) === 'student' ? '/student' : '/parent'
}

/** The children on this account, with one of them picked. For a student the
 *  "family" is themself alone (see `fetchChildren`). */
export function useFamily(): Family {
  const [children, setChildren] = useState<GuardianChild[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState(readPick)
  const [round, setRound] = useState(0)
  /* A link made for one hero (`?student=`) opens on that hero, and makes
     them the pick from here on. */
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('student')
  useEffect(() => {
    if (fromUrl) { setPicked(fromUrl); writePick(fromUrl) }
  }, [fromUrl])

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const kids = await fetchChildren()
        if (live) { setChildren(kids); setError(null) }
      } catch (e) {
        if (live) { setError(toMessage(e)); setChildren([]) }
      }
    })()
    return () => { live = false }
  }, [round])

  const reload = useCallback(() => setRound(r => r + 1), [])

  const pick = useCallback((id: string) => {
    setPicked(id)
    writePick(id)
    /* Picking someone else on a page opened for one hero moves the link on. */
    setParams(p => {
      if (!p.has('student')) return p
      p.set('student', id)
      return p
    }, { replace: true })
  }, [setParams])

  const child = useMemo(() => {
    if (!children?.length) return null
    return children.find(c => c.profile.id === (fromUrl || picked))
      ?? children.find(c => c.profile.id === picked) ?? children[0]
  }, [children, picked, fromUrl])

  return { children, error, child, pick, reload }
}

/* ---------------- one child's material and record ---------------- */

export interface ChildView {
  loading: boolean
  error: string | null
  /** Every program IBSRA runs — the path keeps its shape even where this
   *  child is not on it yet. */
  allTracks: Track[]
  /** Every course of those programs — what the enrol dialog reads for a
   *  program this child is not on yet. */
  allLoops: Loop[]
  tracks: Track[]
  loops: Loop[]
  /** Only the sessions of courses this child is in. */
  sessions: Session[]
  done: Done
  submissions: SubmissionRow[]
}

const EMPTY: ChildView = {
  loading: true, error: null, allTracks: [], allLoops: [], tracks: [], loops: [], sessions: [], done: {}, submissions: [],
}

/** Everything the Material and Feedback pages read, for one child. Fetched
 *  when the child changes and kept in memory while the page is open, so
 *  walking down program → course → sessions costs nothing. */
export function useChildView(child: GuardianChild | null): ChildView {
  const [view, setView] = useState<ChildView>(EMPTY)

  const studentId = child?.profile.id ?? ''
  const loopIds = useMemo(
    () => (child?.enrollments ?? []).filter(e => e.status !== 'dropped').map(e => e.loop_id),
    [child],
  )
  const loopKey = loopIds.join(',')

  useEffect(() => {
    let live = true
    setView(v => ({ ...v, loading: true, error: null }))
    void (async () => {
      try {
        /* With no hero yet there is no progress to read, but the path still
           draws — it is where the family will enrol them. */
        const [content, done, submissions] = await Promise.all([
          fetchFamilyContent(),
          studentId ? fetchChildProgress(studentId) : Promise.resolve({} as Done),
          studentId ? fetchChildSubmissions(studentId) : Promise.resolve([] as SubmissionRow[]),
        ])
        if (!live) return
        const mine = new Set(loopKey ? loopKey.split(',') : [])
        /* The programs the child is on — and every course in them, so the
           family sees where the one they are in sits in the whole path. */
        const trackIds = new Set(
          content.loops.filter(l => mine.has(l.id)).map(l => l.trackId),
        )
        /* The path shows what a family can enrol in — listed training
           programs, not the admin's work area or a hidden draft — plus
           anything this child is already on, whatever its switch says. */
        const allTracks = content.tracks.filter(t =>
          trackIds.has(t.id) || (t.area !== 'work' && (t.listed ?? true)))
        const pathIds = new Set(allTracks.map(t => t.id))
        setView({
          loading: false,
          error: null,
          allTracks,
          allLoops: content.loops.filter(l =>
            pathIds.has(l.trackId) && ((l.listed ?? true) || mine.has(l.id))),
          tracks: content.tracks.filter(t => trackIds.has(t.id)),
          loops: content.loops.filter(l => trackIds.has(l.trackId)),
          sessions: content.sessions.filter(s => mine.has(s.loopId)),
          done,
          submissions,
        })
      } catch (e) {
        if (live) setView({ ...EMPTY, loading: false, error: toMessage(e) })
      }
    })()
    return () => { live = false }
  }, [studentId, loopKey])

  return view
}
