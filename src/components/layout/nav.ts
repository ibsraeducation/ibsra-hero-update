import {
  CalendarDays, ClipboardList, Hammer, Library, LineChart, MessageSquare, Receipt,
  ShieldCheck, Sparkles, Store, Target, Users, Users2, Waypoints,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ViewRole } from '@/lib/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Key into a counts map computed at render time. */
  countKey?: string
}
export interface NavGroup { label?: string; items: NavItem[] }

export const ROLE_META: Record<ViewRole, { label: string; icon: LucideIcon; home: string; tagline: string }> = {
  admin: { label: 'Admin', icon: ShieldCheck, home: '/admin/material', tagline: 'Build what the student opens, and list what a family can buy' },
  student: { label: 'Student', icon: Sparkles, home: '/student/missions', tagline: 'Learn it, build it, publish it, charge for it' },
  parent: { label: 'Parent', icon: Users2, home: '/parent', tagline: 'Progress, skills, what the fees produced, and what comes next' },
}

/* The parent rail on a real account. The one below it is the demo report,
   which only an admin looks at.

   Three entries, and that is the whole family area: the material their child
   opens, the heroes on the account, and the money. Paying and what was
   already filed used to be two rails into one subject — they are a single
   Payments page with two tabs now. The wallet left the rail for the top bar,
   where the balance is readable from every page (see `WalletChip`), and the
   mentor's feedback is reached from the hero it is written about. */
export const PARENT_LIVE_NAV: NavGroup[] = [
  {
    items: [
      /* Material is also where a family enrols: the dimmed programs on its
         path open the enrol dialog. The Marketplace is off the rail for now
         (kits only, and not ready to sell). */
      { to: '/parent/material', label: 'Material', icon: Library },
      /* Where the week a family picked at enrolment actually shows up, one
         hero at a time. */
      { to: '/parent/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/parent/heroes', label: 'My Heroes', icon: Users },
      { to: '/parent/payments', label: 'Payments', icon: Receipt },
    ],
  },
]

/* Which rail a signed-in person sees.

   A family gets its three live pages. An admin may look at the student and
   parent areas, and when they do the rail keeps the Admin group below the
   area's own — without it the only way back is the URL bar. */
export function railFor(view: ViewRole, account?: ViewRole | null): NavGroup[] {
  if (account === 'parent') return PARENT_LIVE_NAV
  if (account === 'admin' && view !== 'admin') {
    /* An admin in the family area sees what a family sees — the live pages.
       The demo report's entries are not theirs to open (routeAccess), so
       every one of them bounced to My Heroes. */
    const own = view === 'parent' ? PARENT_LIVE_NAV : NAV[view]
    return [...own, { label: 'Admin', items: NAV.admin[0].items }]
  }
  return NAV[view]
}

export const NAV: Record<ViewRole, NavGroup[]> = {
  /* Material is what an enrolled student opens. The Marketplace (kits) is
     off the admin rail for now, like the family one. */
  admin: [
    {
      items: [
        { to: '/admin/material', label: 'Material', icon: Library },
        /* Same pages as Material, for the sessions where the student works on their assets. */
        { to: '/admin/work', label: 'Work', icon: Hammer },
        /* Students and Payments are one page with tabs: the accounts, the
           answers to grade, the transfers to check and the payment settings.
           The badge is everything waiting on it. */
        { to: '/admin/students', label: 'Students & payments', icon: Users, countKey: 'people' },
        /* The calendar is a tab of that page now, beside the button that
           books onto it — `/admin/calendar` redirects there. */
        /* Requests is not on the rail: it is reached from the inbox in the
           top bar (`AdminInbox`), next to every other queue waiting on the
           admin. */
      ],
    },
  ],

  /* Missions and MarketPlace have depth behind them; Performance Analysis is
     the same five-page slicer as the parent's, on the student's own record. */
  student: [
    {
      items: [
        { to: '/student/missions', label: 'Missions', icon: Target },
        { to: '/student/work', label: 'Work', icon: Hammer },
        /* When they actually sit: the lectures and sections their parent
           picked. Read-only -- the times are not theirs to move. */
        { to: '/student/calendar', label: 'Calendar', icon: CalendarDays },
        /* Their own record, off the same two areas as the rails above it. */
        { to: '/student/progress', label: 'My Progress', icon: LineChart },
      ],
    },
  ],

  /* The summary is the whole report in one screen; performance and
     investment are the pages it summarises, in the order a parent asks about
     them — how is my child doing, then what did the money produce. The
     marketplace is the one forward-looking surface: what to buy next. */
  parent: [
    {
      items: [
        { to: '/parent', label: 'Reporting Summary', icon: ClipboardList, end: true },
        /* The route before the report: where the whole training path leads. */
        { to: '/parent/path', label: 'Training Path', icon: Waypoints },
        { to: '/parent/performance', label: 'Performance Analysis', icon: LineChart },
        { to: '/parent/mentor', label: 'Ask the mentor', icon: MessageSquare },
        { to: '/parent/marketplace', label: 'Marketplace', icon: Store },
        { to: '/parent/family', label: 'My Family', icon: Users },
      ],
    },
  ],
}
