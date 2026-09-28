/* ==========================================================================
   One inbox, for whoever is signed in.

   A toast is gone in 3.2 seconds; this is a row, written only by
   security-definer functions on the server (a request arriving, a request
   answered — see `answer_request` and its trigger). The client never
   inserts one, so `create*` deliberately does not exist here.

   Live, over a realtime channel on `public.notifications` filtered to the
   signed-in reader: a payment accepted or rejected has to land while the
   family is looking at the page, not up to a minute later. Replication
   honours the same RLS as a read, so a channel only ever carries rows that
   person could have fetched anyway.

   A slow poll stays underneath it. A socket drops — a sleeping laptop, a
   proxy, a phone changing network — and the badge would sit there wrong
   with nothing to correct it; the poll is the floor, not the mechanism.
   ========================================================================== */

import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { backendLive, sb, supabase } from '@/lib/supabase'
import type { NotificationRow } from './rows'

export async function fetchNotifications(limit = 30): Promise<NotificationRow[]> {
  if (!backendLive) return []
  const { data, error } = await sb().from('notifications').select('*')
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as NotificationRow[]
}

export async function unreadCount(): Promise<number> {
  if (!backendLive) return 0
  const { count, error } = await sb().from('notifications')
    .select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) throw error
  return count ?? 0
}

/** Marks the given notifications read, or every unread one when `ids` is
 *  left out. Returns how many changed. */
export async function markRead(ids?: string[]): Promise<number> {
  const { data, error } = await sb().rpc('mark_notifications_read', { p_ids: ids ?? null })
  if (error) throw error
  return (data as number) ?? 0
}

/* One channel per reader, however many things are watching it.
   `supabase.channel(topic)` hands back the channel that already exists for
   that topic, and adding a `postgres_changes` binding to one that has
   subscribed *throws*. So the bell — always mounted in the shell — used to
   take the whole Notifications page down with it the moment that page tried
   to watch the same rows. The watchers share one channel instead, and it is
   only torn down when the last of them leaves. */
const channels = new Map<string, { channel: RealtimeChannel; watchers: Set<() => void> }>()

/** Watch this reader's own notifications. Calls `onChange` when one arrives
 *  or changes; returns the unsubscribe. A no-op without a backend. */
export function watchNotifications(userId: string, onChange: () => void): () => void {
  if (!supabase || !userId) return () => {}
  const topic = `notifications:${userId}`
  let live = channels.get(topic)
  if (!live) {
    const watchers = new Set<() => void>()
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        () => { for (const fn of watchers) fn() },
      )
      .subscribe()
    live = { channel, watchers }
    channels.set(topic, live)
  }
  live.watchers.add(onChange)

  return () => {
    const held = channels.get(topic)
    if (!held) return
    held.watchers.delete(onChange)
    if (held.watchers.size === 0) {
      channels.delete(topic)
      void supabase?.removeChannel(held.channel)
    }
  }
}

interface Inbox {
  unread: number
  items: NotificationRow[]
  loading: boolean
  refresh: () => Promise<void>
  markOneRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useInbox = create<Inbox>((set, get) => ({
  unread: 0,
  items: [],
  loading: false,
  refresh: async () => {
    if (!backendLive) return
    set({ loading: true })
    try {
      const [items, unread] = await Promise.all([fetchNotifications(), unreadCount()])
      set({ items, unread, loading: false })
    } catch {
      /* A failed poll is not worth a toast — the bell just stays as it was. */
      set({ loading: false })
    }
  },
  markOneRead: async (id: string) => {
    set(s => ({
      items: s.items.map(n => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)),
      unread: Math.max(0, s.unread - 1),
    }))
    try { await markRead([id]) } catch { void get().refresh() }
  },
  markAllRead: async () => {
    const now = new Date().toISOString()
    set(s => ({ items: s.items.map(n => ({ ...n, read_at: n.read_at ?? now })), unread: 0 }))
    try { await markRead() } catch { void get().refresh() }
  },
}))
