import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react'
import { signOut, useAuth } from '@/lib/auth'
import { useStore } from '@/lib/store'
import { Avatar, Badge, Menu, MenuItem, MenuLabel, MenuSep } from '@/components/ui'

const ROLE_LABEL = { admin: 'Admin', student: 'Student', parent: 'Parent' } as const
const ROLE_TONE = { admin: 'brand', student: 'teal', parent: 'gold' } as const

/** The signed-in person, in the top bar: who, which role, and the way out. */
export function UserMenu() {
  const profile = useAuth(s => s.profile)
  const theme = useStore(s => s.theme)
  const toggleTheme = useStore(s => s.toggleTheme)
  const nav = useNavigate()
  if (!profile) return null
  const name = profile.name || profile.email

  return (
    <Menu align="end" trigger={p => (
      <button className="btn ghost sm" {...p} aria-label="Account menu" title={profile.email}>
        <Avatar name={name} size="sm" />
        <span className="hide-sm truncate" style={{ maxWidth: 140 }}>{name}</span>
      </button>
    )}>
      <MenuLabel>
        <span className="stack g2" style={{ textTransform: 'none', letterSpacing: 0 }}>
          <span className="t-sm w-sb c-ink2">{name}</span>
          <span className="t-xs c-muted2">{profile.email}</span>
        </span>
      </MenuLabel>
      <div style={{ padding: '0 10px 8px' }}>
        <Badge tone={ROLE_TONE[profile.role]} dot>{ROLE_LABEL[profile.role]}</Badge>
      </div>
      <MenuSep />
      {/* Wherever an admin has wandered, this is the way back to their own pages. */}
      {profile.role === 'admin' && (
        <MenuItem icon={<ShieldCheck />} onClick={() => nav('/admin/material')}>Admin workspace</MenuItem>
      )}
      <MenuItem icon={theme === 'light' ? <Moon /> : <Sun />} onClick={toggleTheme}>
        {theme === 'light' ? 'Dark theme' : 'Light theme'}
      </MenuItem>
      <MenuItem icon={<KeyRound />} onClick={() => nav('/account/password')}>Change password</MenuItem>
      <MenuSep />
      <MenuItem icon={<LogOut />} onClick={() => void signOut()} danger>Sign out</MenuItem>
    </Menu>
  )
}
