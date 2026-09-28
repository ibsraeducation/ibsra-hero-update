import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Command, Menu as MenuIcon, Moon, PanelLeftClose, PanelLeftOpen,
  RotateCcw, Sun, X,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ViewRole } from '@/lib/types'
import { railFor, ROLE_META } from './nav'
import { CommandPalette } from './CommandPalette'
import { Menu, MenuItem, MenuLabel, MenuSep, Toasts } from '@/components/ui'
import { relative } from '@/lib/format'
import { backendLive } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useAdminQueue } from '@/lib/api/adminQueue'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UserMenu } from './UserMenu'
import { SyncBadge } from './SyncBadge'
import { RenewCountdown } from './RenewCountdown'
import { WalletChip } from './WalletChip'
import { NotificationBell } from './NotificationBell'
import { AdminInbox } from './AdminInbox'
import { DevRoleTabs } from './DevRoleTabs'
import { devSwitching } from '@/lib/devAccounts'
import { SubscriptionGate } from '@/components/auth/SubscriptionGate'

/* ---------------- role switcher ---------------- */
function RoleSwitcher() {
  const role = useStore(s => s.role)
  const setRole = useStore(s => s.setRole)
  const nav = useNavigate()

  const go = (r: ViewRole) => {
    setRole(r)
    nav(ROLE_META[r].home)
  }

  return (
    <div className="roles" title="Dev-stage role switch — no auth">
      {/* Parent is hidden from the switcher for now; /parent still resolves. */}
      {(Object.keys(ROLE_META) as ViewRole[]).filter(r => r !== 'parent').map(r => {
        const M = ROLE_META[r]
        return (
          <button key={r} className="role-pill" data-on={role === r} onClick={() => go(r)}>
            <M.icon /><span className="hide-sm">{M.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- sidebar ---------------- */
function Rail({ mobileOpen, closeMobile }: { mobileOpen: boolean; closeMobile: () => void }) {
  const role = useStore(s => s.role)
  /* A signed-in family gets the live parent pages, not the demo report. */
  const accountRole = useAuth(s => s.profile?.role)
  const collapsed = useStore(s => s.railCollapsed)
  const toggleRail = useStore(s => s.toggleRail)

  /* What is waiting for the admin does not live in the store: it is rows on
     the server, and the queue keeps them where the rail can read them. */
  const queue = useAdminQueue()
  const isAdmin = backendLive && accountRole === 'admin'
  useEffect(() => { if (isAdmin) void queue.refresh() }, [isAdmin, queue.refresh])

  const counts = useMemo(() => ({
    requests: queue.requests || undefined,
    payments: queue.payments || undefined,
    grading: queue.grading || undefined,
    /* Students & payments carries both of its queues. */
    people: queue.grading + queue.payments || undefined,
  }), [queue.requests, queue.payments, queue.grading])

  const M = ROLE_META[role]
  /* An admin may look at the student and parent areas, so the rail always
     keeps the way back to Admin — without it the only exit is the URL bar. */
  const visiting = backendLive && accountRole === 'admin' && role !== 'admin'
  const groups = railFor(role, backendLive ? accountRole : null)

  return (
    <nav className="rail" data-open={mobileOpen}>
      <div className="rail-brand">
        <div className="rail-mark">IH</div>
        <div className="stack brandtext grow" style={{ lineHeight: 1.2 }}>
          <span className="t-sm w-sb">IBSRA Heros</span>
          <span className="t-xs c-muted2">{visiting ? `${M.label} preview` : `${M.label} workspace`}</span>
        </div>
        <button className="btn ghost icon sm rail-toggle" onClick={closeMobile} aria-label="Close menu"><X /></button>
      </div>

      <div className="rail-nav">
        {groups.map((group, gi) => (
          <div key={gi} className={gi ? 'rail-group' : undefined}>
            {group.label && <div className="eyebrow">{group.label}</div>}
            {group.items.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-item"
                onClick={closeMobile} title={collapsed ? item.label : undefined}>
                <item.icon />
                <span className="truncate">{item.label}</span>
                {item.countKey && counts[item.countKey as keyof typeof counts] != null && (
                  <span className="tail">{counts[item.countKey as keyof typeof counts]}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="rail-foot">
        <button className="nav-item" onClick={toggleRail}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span>Collapse</span>
        </button>
      </div>
    </nav>
  )
}

/* ---------------- saved indicator ---------------- */
function SavedTick() {
  const savedAt = useStore(s => s.savedAt)
  const [, force] = useState(0)
  useEffect(() => {
    if (!savedAt) return
    const t = window.setInterval(() => force(n => n + 1), 15_000)
    return () => clearInterval(t)
  }, [savedAt])
  if (!savedAt) return null
  return (
    <span className="saving hide-sm" title="Everything is stored locally in this browser">
      Saved {relative(new Date(savedAt).toISOString())}
    </span>
  )
}

/* ---------------- shell ---------------- */
export function AppShell() {
  const collapsed = useStore(s => s.railCollapsed)
  const theme = useStore(s => s.theme)
  const toggleTheme = useStore(s => s.toggleTheme)
  const resetDemo = useStore(s => s.resetDemo)
  const role = useStore(s => s.role)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { setMobileOpen(false) }, [loc.pathname])

  /* The URL is the source of truth for which dashboard you are in, so a
     deep link or a back-button press keeps the rail and the switcher honest. */
  const setRole = useStore(s => s.setRole)
  /* Signed in, the role is the account's; only an admin looks at other areas. */
  const accountRole = useAuth(s => s.profile?.role)
  useEffect(() => {
    if (backendLive && accountRole !== 'admin') return
    const seg = loc.pathname.split('/')[1] as ViewRole
    if (seg && seg !== role && seg in ROLE_META) setRole(seg)
  }, [loc.pathname, role, setRole, accountRole])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const M = ROLE_META[role]

  return (
    <div className="shell" data-collapsed={collapsed}>
      <Rail mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon sm rail-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <MenuIcon />
          </button>

          <div className="grow row g10" style={{ minWidth: 0 }}>
            {!backendLive && (
              <span className="badge line hide-sm" title="Local demo — no backend configured">
                dev · no auth
              </span>
            )}
            {/* Admin · Parent · Student, one click each. `import.meta.env.DEV`
                first so the bundler folds the whole thing — component, markup
                and all — out of a production build. */}
            {import.meta.env.DEV && devSwitching && backendLive && <DevRoleTabs />}
            <span className="t-sm c-muted truncate hide-sm">{M.tagline}</span>
          </div>

          {/* A parent's money, in the order they think about it: what is on
              the account, then how long it keeps the platform open. Nobody
              else has either. */}
          <WalletChip />
          <RenewCountdown />

          {/* What waits on the admin, one tap from any page. */}
          {backendLive && accountRole === 'admin' && <AdminInbox />}
          {backendLive && <NotificationBell />}

          {backendLive ? <SyncBadge /> : <SavedTick />}

          <button className="btn sm ghost" onClick={() => setCmdOpen(true)} title="Command palette">
            <Command /><span className="hide-sm">Search</span>
            <span className="kbd hide-sm" style={{ marginInlineStart: 2 }}>⌘K</span>
          </button>

          <div className="vsep hide-sm" />

          {backendLive ? <UserMenu /> : <RoleSwitcher />}

          {!backendLive && <Menu align="end" trigger={p => (
            <button className="btn ghost icon sm" {...p} aria-label="Workspace menu">
              {theme === 'light' ? <Sun /> : <Moon />}
            </button>
          )}>
            <MenuLabel>Appearance</MenuLabel>
            <MenuItem icon={theme === 'light' ? <Moon /> : <Sun />} onClick={toggleTheme}>
              {theme === 'light' ? 'Dark theme' : 'Light theme'}
            </MenuItem>
            <MenuSep />
            <MenuLabel>Dev data</MenuLabel>
            <MenuItem icon={<RotateCcw />} onClick={resetDemo} danger>Reset demo data</MenuItem>
          </Menu>}
        </header>

        <main className="content" id="content">
          <ErrorBoundary resetKey={loc.pathname}>
            {/* Past the closing day a student meets the door instead of their work. */}
            <SubscriptionGate>
              <Outlet />
            </SubscriptionGate>
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <Toasts />
    </div>
  )
}
