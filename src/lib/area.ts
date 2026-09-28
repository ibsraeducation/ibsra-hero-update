/* ==========================================================================
   Two areas, each with its own programs → courses → sessions:
     Material — what the student learns from.
     Work     — where the student works on their own assets.
   They run on the same pages and the same session editor, but share nothing:
   a program belongs to exactly one area, and its courses and sessions go
   with it. Unset is Material, so every program saved before Work existed
   stays exactly where it was.
   ========================================================================== */

import { useLocation } from 'react-router-dom'
import type { ContentArea, Track } from './types'

export const AREA_META: Record<ContentArea, {
  /** The admin area's name. */
  label: string
  /** Where the admin area starts. */
  admin: string
  /** The student's name for it, and where it starts. */
  studentLabel: string
  student: string
}> = {
  material: { label: 'Material', admin: '/admin/material', studentLabel: 'Missions', student: '/student/missions' },
  work: { label: 'Work', admin: '/admin/work', studentLabel: 'Work', student: '/student/work' },
}

export const trackArea = (t: Pick<Track, 'area'> | undefined): ContentArea => t?.area ?? 'material'

export const inArea = (area: ContentArea) => (t: Pick<Track, 'area'>) => trackArea(t) === area

/** Only a Work program carries the field — a Material one stays unset. */
export const areaPatch = (area: ContentArea): Partial<Track> => (area === 'work' ? { area } : {})

const WORK = /^\/(admin|student)\/work(\/|$)/

/** The area a page is showing, read off its URL. */
export function useArea(): ContentArea {
  return WORK.test(useLocation().pathname) ? 'work' : 'material'
}

/* ---------------- what each area calls its three levels ----------------
   Material teaches: a training program holds courses. Work builds: a
   project runs in milestones. The levels themselves are the same three —
   only the words change, so one set of pages can speak both. */

export interface AreaNouns {
  /** Level 1, lower case — "program", "project". */
  track: string
  trackPlural: string
  /** Level 2, lower case — "course", "milestone". */
  loop: string
  loopPlural: string
  /** The three steps across the top of the admin pages. */
  steps: [string, string, string]
  /** The same three, as the student reads them. */
  studentSteps: [string, string, string]
}

export const AREA_NOUNS: Record<ContentArea, AreaNouns> = {
  material: {
    track: 'program',
    trackPlural: 'programs',
    loop: 'course',
    loopPlural: 'courses',
    steps: ['Training program', 'Course', 'Sessions & topics'],
    studentSteps: ['Program', 'Course', 'Sessions (topics)'],
  },
  work: {
    track: 'project',
    trackPlural: 'projects',
    loop: 'milestone',
    loopPlural: 'milestones',
    steps: ['Project', 'Milestone', 'Sessions'],
    studentSteps: ['Project', 'Milestone', 'Sessions'],
  },
}

/** The nouns of the area a page is showing. */
export const useNouns = (): AreaNouns => AREA_NOUNS[useArea()]

/** A stored-lower-case noun at the start of a sentence or a label. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
