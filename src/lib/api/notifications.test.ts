/* The bell and the Notifications page watch the same rows at the same time.
   supabase-js hands back the channel that already exists for a topic, and
   binding `postgres_changes` to one that has already subscribed throws — so
   the second watcher used to take its page down with it. The fake below
   keeps both of those rules, which is the whole point of the test. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const removed: unknown[] = []

class FakeChannel {
  subscribed = false
  handlers: Array<() => void> = []
  constructor(public topic: string) {}
  on(_type: string, _filter: unknown, fn: () => void) {
    if (this.subscribed) throw new Error(`cannot add \`postgres_changes\` callbacks for ${this.topic} after \`subscribe()\`.`)
    this.handlers.push(fn)
    return this
  }
  subscribe() { this.subscribed = true; return this }
  fire() { for (const fn of this.handlers) fn() }
}

const open = new Map<string, FakeChannel>()

vi.mock('@/lib/supabase', () => ({
  backendLive: true,
  sb: () => { throw new Error('not used here') },
  supabase: {
    channel(topic: string) {
      const held = open.get(topic)
      if (held) return held
      const made = new FakeChannel(topic)
      open.set(topic, made)
      return made
    },
    removeChannel(c: FakeChannel) { removed.push(c); open.delete(c.topic) },
  },
}))

const { watchNotifications } = await import('./notifications')

describe('watchNotifications', () => {
  beforeEach(() => { open.clear(); removed.length = 0 })

  it('lets two readers watch the same person without throwing', () => {
    const bell = vi.fn()
    const page = vi.fn()
    const stopBell = watchNotifications('u1', bell)
    const stopPage = watchNotifications('u1', page)

    expect(open.size).toBe(1)
    open.get('notifications:u1')!.fire()
    expect(bell).toHaveBeenCalledTimes(1)
    expect(page).toHaveBeenCalledTimes(1)

    stopBell(); stopPage()
  })

  it('keeps the channel until the last watcher leaves', () => {
    const bell = vi.fn()
    const page = vi.fn()
    const stopBell = watchNotifications('u1', bell)
    const stopPage = watchNotifications('u1', page)

    stopPage()
    expect(removed).toHaveLength(0)
    open.get('notifications:u1')!.fire()
    expect(bell).toHaveBeenCalledTimes(1)
    expect(page).toHaveBeenCalledTimes(0)

    stopBell()
    expect(removed).toHaveLength(1)
    expect(open.size).toBe(0)
  })

  it('opens a fresh channel after everyone has gone', () => {
    watchNotifications('u1', vi.fn())()
    const again = watchNotifications('u1', vi.fn())
    expect(open.size).toBe(1)
    again()
  })

  it('gives each person their own channel', () => {
    const stop1 = watchNotifications('u1', vi.fn())
    const stop2 = watchNotifications('u2', vi.fn())
    expect(open.size).toBe(2)
    stop1(); stop2()
  })

  it('is a no-op without a user', () => {
    expect(() => watchNotifications('', vi.fn())()).not.toThrow()
    expect(open.size).toBe(0)
  })
})
