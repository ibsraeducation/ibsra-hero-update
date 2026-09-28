/* ==========================================================================
   What changed between two store snapshots. Pure.

   The store replaces an object only when something inside it changed and
   keeps every other reference, so "changed" is simply "not the same object".
   ========================================================================== */

import type { Loop, Session, Track } from '@/lib/types'

export interface ContentSlice {
  tracks: Track[]
  loops: Loop[]
  sessions: Session[]
}

export interface KindDiff<T> { upsert: T[]; remove: string[] }

export interface ContentDiff {
  tracks: KindDiff<Track>
  loops: KindDiff<Loop>
  sessions: KindDiff<Session>
  /** Ids inside `loops.remove` that go only because their program went.
   *  The database restricts there rather than cascading, so they are still
   *  sent — before the program — but they are one delete, not many. */
  loopsOfRemovedTracks: string[]
}

function diffList<T extends { id: string }>(prev: T[], next: T[]): KindDiff<T> {
  if (prev === next) return { upsert: [], remove: [] }
  const before = new Map(prev.map(x => [x.id, x]))
  const upsert: T[] = []
  for (const item of next) {
    if (before.get(item.id) !== item) upsert.push(item)
    before.delete(item.id)
  }
  return { upsert, remove: [...before.keys()] }
}

export function diffContent(prev: ContentSlice, next: ContentSlice): ContentDiff {
  const tracks = diffList(prev.tracks, next.tracks)
  const loops = diffList(prev.loops, next.loops)
  const sessions = diffList(prev.sessions, next.sessions)

  /* A deleted course takes its sessions with it in the database (cascade),
     so those sessions need no delete of their own. */
  if (loops.remove.length && sessions.remove.length) {
    const goneLoops = new Set(loops.remove)
    const loopOf = new Map(prev.sessions.map(s => [s.id, s.loopId]))
    sessions.remove = sessions.remove.filter(id => !goneLoops.has(loopOf.get(id) ?? ''))
  }

  /* A deleted program takes its courses with it, one write in the store and
     one action by the admin. The database will not cascade them, so they
     stay in the diff — but they are not separate deletes. */
  let loopsOfRemovedTracks: string[] = []
  if (tracks.remove.length && loops.remove.length) {
    const goneTracks = new Set(tracks.remove)
    const trackOf = new Map(prev.loops.map(l => [l.id, l.trackId]))
    loopsOfRemovedTracks = loops.remove.filter(id => goneTracks.has(trackOf.get(id) ?? ''))
  }
  return { tracks, loops, sessions, loopsOfRemovedTracks }
}

export const isEmptyDiff = (d: ContentDiff) =>
  !d.tracks.upsert.length && !d.tracks.remove.length &&
  !d.loops.upsert.length && !d.loops.remove.length &&
  !d.sessions.upsert.length && !d.sessions.remove.length

/** One edit never removes this much at once; a change that does is a bug
 *  (or a reset) and must not be pushed to the server.
 *
 *  What one delete drags behind it does not count against it: a program of
 *  any size is one program, and a course of any length is one course. Only
 *  rows an admin removed on their own are counted. */
export function tooManyRemovals(d: ContentDiff): boolean {
  const withTheirTrack = new Set(d.loopsOfRemovedTracks)
  const loops = d.loops.remove.filter(id => !withTheirTrack.has(id))
  return d.tracks.remove.length > 1 || loops.length > 2 || d.sessions.remove.length > 5
}

export type Done = Record<string, string[]>
export interface StepChange { sessionId: string; key: string }

export function diffDone(prev: Done, next: Done): { add: StepChange[]; remove: StepChange[] } {
  const add: StepChange[] = []
  const remove: StepChange[] = []
  if (prev === next) return { add, remove }
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const sessionId of ids) {
    const a = prev[sessionId] ?? []
    const b = next[sessionId] ?? []
    if (a === b) continue
    const was = new Set(a)
    const now = new Set(b)
    for (const key of now) if (!was.has(key)) add.push({ sessionId, key })
    for (const key of was) if (!now.has(key)) remove.push({ sessionId, key })
  }
  return { add, remove }
}
