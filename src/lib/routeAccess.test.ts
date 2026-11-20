import { describe, expect, it } from 'vitest'
import { decide, safeNext } from './routeAccess'

describe('decide', () => {
  it('keeps each role in its own area', () => {
    expect(decide('/admin/material/trk_1', 'admin')).toEqual({ allow: true })
    expect(decide('/admin/students', 'student')).toEqual({ allow: false, to: '/student/missions' })
    expect(decide('/student/session/ses_1', 'student')).toEqual({ allow: true })
    expect(decide('/student/missions', 'admin')).toEqual({ allow: false, to: '/admin/material' })
    expect(decide('/student/missions/trk_1/lop_1', 'student')).toEqual({ allow: true })
    expect(decide('/student/progress', 'student')).toEqual({ allow: true })
    expect(decide('/student/progress', 'parent')).toEqual({ allow: false, to: '/parent/material' })
  })

  /* Work stopped being an area of its own: it is a course type inside a
     program, so the two old roots are nobody's any more. */
  it('sends the retired Work paths home', () => {
    expect(decide('/student/work/trk_1/lop_1', 'student')).toEqual({ allow: false, to: '/student/missions' })
    expect(decide('/admin/work/trk_1', 'admin')).toEqual({ allow: true })
  })

  it('holds an admin to the same live pages a family gets when previewing /parent', () => {
    expect(decide('/parent/material', 'admin')).toEqual({ allow: true })
    expect(decide('/parent/marketplace', 'admin')).toEqual({ allow: true })
    expect(decide('/parent', 'admin')).toEqual({ allow: false, to: '/parent/material' })
    expect(decide('/parent/performance/learning', 'admin')).toEqual({ allow: false, to: '/parent/material' })
    expect(decide('/parent/performance/learning', 'student')).toEqual({ allow: false, to: '/student/missions' })
  })

  it('gives a parent its live pages and nothing else', () => {
    expect(decide('/parent/material', 'parent')).toEqual({ allow: true })
    expect(decide('/parent/heroes', 'parent')).toEqual({ allow: true })
    expect(decide('/parent/feedback', 'parent')).toEqual({ allow: true })
    expect(decide('/parent/wallet', 'parent')).toEqual({ allow: true })
    expect(decide('/parent/payments', 'parent')).toEqual({ allow: true })
    expect(decide('/parent/marketplace', 'parent')).toEqual({ allow: true })
    expect(decide('/parent', 'parent')).toEqual({ allow: false, to: '/parent/material' })
    expect(decide('/parent/performance/learning', 'parent')).toEqual({ allow: false, to: '/parent/material' })
    expect(decide('/admin/material', 'parent')).toEqual({ allow: false, to: '/parent/material' })
    expect(decide('/student/missions', 'parent')).toEqual({ allow: false, to: '/parent/material' })
  })

  it('still lets a family through the paths that now redirect', () => {
    /* Both of these render a <Navigate>, so refusing them here would bounce
       an old link home instead of forwarding it. */
    expect(decide('/parent/children', 'parent')).toEqual({ allow: true })
    expect(decide('/parent/enroll', 'parent')).toEqual({ allow: true })
  })

  it('sends a student away from the student pages still on demo data', () => {
    expect(decide('/student/performance/learning', 'student')).toEqual({ allow: false, to: '/student/missions' })
  })

  it('no longer lets a student open a payments page of their own', () => {
    expect(decide('/student/payments', 'student')).toEqual({ allow: false, to: '/student/missions' })
  })

  it('lets a student into the marketplace and their own calendar', () => {
    expect(decide('/student/marketplace', 'student')).toEqual({ allow: true })
    expect(decide('/student/marketplace/program/trk_1', 'student')).toEqual({ allow: true })
    expect(decide('/student/calendar', 'student')).toEqual({ allow: true })
    expect(decide('/student/marketplace', 'parent')).toEqual({ allow: false, to: '/parent/material' })
  })

  it('lets a parent into their calendar, and reads the one notification inbox for anybody', () => {
    expect(decide('/parent/calendar', 'parent')).toEqual({ allow: true })
    expect(decide('/notifications', 'student')).toEqual({ allow: true })
    expect(decide('/notifications', 'parent')).toEqual({ allow: true })
    expect(decide('/notifications', 'admin')).toEqual({ allow: true })
  })

  it('does not confuse a prefix with a section', () => {
    expect(decide('/administrator', 'admin')).toEqual({ allow: false, to: '/admin/material' })
    expect(decide('/', 'student')).toEqual({ allow: false, to: '/student/missions' })
  })
})

describe('safeNext', () => {
  it('honours a next path the role may open, and nothing off-site', () => {
    expect(safeNext('/admin/students', 'admin')).toBe('/admin/students')
    expect(safeNext('/admin/students', 'student')).toBe('/student/missions')
    expect(safeNext('//evil.example', 'admin')).toBe('/admin/material')
    expect(safeNext(null, 'student')).toBe('/student/missions')
  })
})
