/* ==========================================================================
   My Heroes — the parent's own page, and the family's way into each child.

   A parent adds each hero here and chooses the password they sign in with.
   The account by itself opens nothing: a course reaches it only after the
   admin approves the transfer the family filed for a training program.

   It is also where the mentor's feedback is reached from. That page used to
   have a rail entry beside this one, which asked a parent to pick between
   "my students" and "what the mentor said about them" — two names for the
   same child. The hero is the thing; the feedback hangs off them.
   ========================================================================== */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BookOpen, KeyRound, Loader2, Lock, MessageSquare, Plus,
  ShoppingBag, User, Users,
} from 'lucide-react'
import { fetchChildren, resetChildPassword, ParentUsersError } from '@/lib/api/family'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty, Modal } from '@/components/ui'
import {
  createHero, EMPTY_HERO, HeroFields, heroProblem, type HeroDraft,
} from './HeroFields'
import { PasswordField } from './PasswordField'
import type { GuardianChild } from '@/lib/api/rows'
import './family.css'
import './live.css'


/* ---------------- add a student ---------------- */

function AddChild({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const toast = useStore(s => s.toast)
  const [draft, setDraft] = useState<HeroDraft>(EMPTY_HERO)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    const wrong = heroProblem(draft)
    if (wrong) { setError(wrong); return }
    setBusy(true)
    setError(null)
    try {
      await createHero(draft)
      toast('Hero added — buy a program to open their courses')
      onAdded()
      onClose()
    } catch (err) {
      setError(err instanceof ParentUsersError ? err.message : toMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a hero"
      description="They sign in with this email and the password you choose. Nothing opens for them until a program is paid for and approved."
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Plus />}{busy ? 'Adding…' : 'Add hero'}
          </button>
        </>
      }
    >
      <form className="stack g14" onSubmit={save}>
        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}
        <HeroFields value={draft} onChange={setDraft} idPrefix="child" autoFocus />
      </form>
    </Modal>
  )
}

/* ---------------- change a student's password ---------------- */

function ChangeChildPassword({ child, onClose }: { child: GuardianChild; onClose: () => void }) {
  const toast = useStore(s => s.toast)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (password.length < 8) { setError('At least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords are not the same.'); return }
    setBusy(true)
    setError(null)
    try {
      await resetChildPassword(child.profile.id, password)
      toast(`${child.profile.name || 'The hero'} has a new password`)
      onClose()
    } catch (err) {
      setError(err instanceof ParentUsersError ? err.message : toMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`New password · ${child.profile.name || child.profile.email}`}
      description="They sign in with this from now on. Their work and their courses are untouched."
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <KeyRound />}Set password
          </button>
        </>
      }
    >
      <div className="stack g14">
        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}
        <PasswordField id="child-new-pw" label="New password" value={password} onChange={setPassword}
          />
        <PasswordField id="child-new-pw2" label="Confirm password" value={confirm} onChange={setConfirm}
          hint={confirm && confirm !== password ? 'The two passwords are not the same.' : undefined} />
      </div>
    </Modal>
  )
}

/* ---------------- the page ---------------- */

export function ParentChildren() {
  const [rows, setRows] = useState<GuardianChild[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [changing, setChanging] = useState<GuardianChild | null>(null)
  const nav = useNavigate()

  const load = useCallback(async () => {
    try {
      setError(null)
      setRows(await fetchChildren())
    } catch (e) {
      setError(toMessage(e))
      setRows([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="page">
      <PageHeader
        title="My heroes"
        actions={<button className="btn primary" onClick={() => setAdding(true)}><Plus />Add hero</button>}
      />

      {error && (
        <div className="auth-alert mb12" role="alert"><AlertTriangle /><span>{error}</span></div>
      )}

      {rows === null ? (
        <div className="card" style={{ padding: 28 }}>
          <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading your heroes…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <Empty icon={<Users />} title="No heroes on your account yet"
            action={<button className="btn primary" onClick={() => setAdding(true)}><Plus />Add hero</button>} />
        </div>
      ) : (
        <div className="fam-stack">
          {rows.map(row => {
            const open = row.enrollments.filter(e => e.status !== 'dropped').length
            return (
              <article key={row.profile.id} className="card">
                <div className="pd-head">
                  <span className="fn-card-ico lg" style={{ background: 'var(--brand-100)', color: 'var(--brand-600)' }}>
                    <User />
                  </span>
                  <div className="stack g4 grow" style={{ minWidth: 0 }}>
                    <div className="row g8 wrap">
                      {open > 0
                        ? <Badge tone="teal" dot>{open} course{open === 1 ? '' : 's'} open</Badge>
                        : <Badge tone="gold" dot>No access yet</Badge>}
                      <span className="eyebrow">Hero</span>
                    </div>
                    <h2 className="t-lg w-sb truncate">{row.profile.name || row.profile.email}</h2>
                    <span className="t-sm c-muted truncate">{row.profile.email}</span>
                  </div>
                  <div className="row g8 wrap" style={{ flex: 'none' }}>
                    <button className="btn sm" onClick={() => setChanging(row)}>
                      <KeyRound />Password
                    </button>
                    {/* The mentor's read on this hero — the page that used to
                        sit in the rail under a name of its own. */}
                    <Link className="btn sm" to={`/parent/feedback?student=${row.profile.id}`}>
                      <MessageSquare />Feedback
                    </Link>
                    <button className="btn sm primary"
                      onClick={() => nav(`/parent/material?student=${row.profile.id}`)}>
                      <ShoppingBag />Buy a program
                    </button>
                  </div>
                </div>

                <div className="pd-meta">
                  {row.profile.age ? <span><b>{row.profile.age}</b> years old</span> : null}
                  <span><b>{open}</b> course{open === 1 ? '' : 's'} open to them</span>
                  {row.profile.disabled && <span className="c-rose">Account paused by the admin</span>}
                </div>

                {open === 0 && (
                  <div className="pd-col" style={{ paddingTop: 0 }}>
                    <p className="t-xs c-muted2 row g6" style={{ lineHeight: 1.6 }}>
                      <Lock style={{ width: 13, height: 13 }} />
                      They can sign in now, but their dashboard is empty until a program is paid for.
                      {' '}<Link className="crumb-link" to={`/parent/material?student=${row.profile.id}`}>
                        Pick a program
                      </Link>.
                    </p>
                  </div>
                )}

                {open > 0 && (
                  <div className="pd-col" style={{ paddingTop: 0 }}>
                    <h3 className="pd-col-head"><BookOpen />What is open</h3>
                    <p className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>
                      {open} course{open === 1 ? '' : 's'} across the programs you have paid for.
                      They see them under Missions when they sign in.
                    </p>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {adding && <AddChild onClose={() => setAdding(false)} onAdded={() => void load()} />}
      {changing && <ChangeChildPassword child={changing} onClose={() => setChanging(null)} />}
    </div>
  )
}

