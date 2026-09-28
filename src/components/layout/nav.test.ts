import { describe, expect, it } from 'vitest'
import { NAV, PARENT_LIVE_NAV, railFor } from './nav'

const paths = (groups: ReturnType<typeof railFor>) =>
  groups.flatMap(g => g.items.map(i => i.to))

describe('railFor', () => {
  it('gives a family its live pages, with no marketplace for now', () => {
    expect(railFor('parent', 'parent')).toBe(PARENT_LIVE_NAV)
    expect(paths(railFor('parent', 'parent'))).toEqual([
      '/parent/material', '/parent/calendar', '/parent/heroes', '/parent/payments',
    ])
  })

  it('keeps the marketplace off the student rail for now', () => {
    expect(paths(NAV.student)).not.toContain('/student/marketplace')
  })

  it('keeps the wallet and the mentor feedback out of a family rail', () => {
    /* The balance lives in the top bar and the feedback hangs off the hero
       it is about — a rail entry for either is a second name for the same
       thing. */
    const p = paths(railFor('parent', 'parent'))
    expect(p).not.toContain('/parent/wallet')
    expect(p).not.toContain('/parent/feedback')
  })

  it('has one way into paying, not two', () => {
    const p = paths(railFor('parent', 'parent'))
    expect(p).not.toContain('/parent/enroll')
    expect(p.filter(x => x === '/parent/payments')).toHaveLength(1)
  })

  it('gives every role a way into its own calendar', () => {
    /* The times are the product now -- a family picks a week at enrolment
       and three different people need to read it back. A route with no rail
       entry is a page nobody finds. */
    expect(paths(railFor('parent', 'parent'))).toContain('/parent/calendar')
    expect(paths(NAV.student)).toContain('/student/calendar')
    /* The admin's is a tab of Students & payments, which the rail holds. */
    expect(paths(NAV.admin)).toContain('/admin/students')
  })

  it('keeps Programs off the admin rail', () => {
    expect(paths(NAV.admin)).not.toContain('/admin/programs')
  })

  it('gives an admin in their own area the admin rail alone', () => {
    expect(railFor('admin', 'admin')).toBe(NAV.admin)
  })

  it('badges the queues that matter, and keeps feedback off the rail', () => {
    const items = NAV.admin[0].items
    /* The daily note is reached from the hero it is written about, not from
       a rail entry of its own. */
    expect(items.map(i => i.to)).not.toContain('/admin/feedback')
    const byPath = Object.fromEntries(items.map(i => [i.to, i.countKey]))
    /* Requests is reached from the inbox in the top bar, not the rail. */
    expect(byPath['/admin/requests']).toBeUndefined()
    /* Payments is a tab of Students & payments, badged with both queues. */
    expect(byPath['/admin/payments']).toBeUndefined()
    expect(byPath['/admin/students']).toBe('people')
  })

  it('keeps the way back to Admin when an admin looks at the parent report', () => {
    const groups = railFor('parent', 'admin')
    expect(paths(groups)).toContain('/admin/material')
    expect(groups[groups.length - 1].label).toBe('Admin')
  })

  it('gives an admin in the family area the live family pages, not the demo report', () => {
    /* The demo entries are not an admin's to open (routeAccess) — each one
       bounced to My Heroes. */
    const p = paths(railFor('parent', 'admin'))
    expect(p).toEqual(expect.arrayContaining(paths(PARENT_LIVE_NAV)))
    expect(p).not.toContain('/parent/path')
    expect(p).not.toContain('/parent/performance')
  })

  it('does the same in the student area', () => {
    expect(paths(railFor('student', 'admin'))).toContain('/admin/material')
  })

  it('gives a student their own record, under the two areas it reads', () => {
    const p = paths(railFor('student'))
    expect(p).toContain('/student/progress')
    expect(p.indexOf('/student/progress')).toBeGreaterThan(p.indexOf('/student/work'))
  })

  it('puts the training path in the demo parent rail, above the numbers', () => {
    const p = paths(railFor('parent', null))
    expect(p).toContain('/parent/path')
    expect(p.indexOf('/parent/path')).toBeLessThan(p.indexOf('/parent/performance'))
  })

  it('keeps the training path out of a real family rail', () => {
    /* A signed-in family gets its three live pages; the path belongs to the
       demo report an admin reads. */
    expect(paths(railFor('parent', 'parent'))).not.toContain('/parent/path')
  })

  it('leaves the demo (no account) rail exactly as it was', () => {
    expect(railFor('parent', null)).toBe(NAV.parent)
    expect(railFor('student')).toBe(NAV.student)
  })
})
