import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Archive, ArrowUpDown, CheckCircle2, ChevronRight, Copy, FileText, Filter,
  ListChecks, MoreHorizontal, Plus, Radio, Send, Trash2, Video, X,
} from 'lucide-react'
import { useStore, readiness, sessionStats } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Badge, Confirm, Empty, Menu, MenuItem, MenuLabel, MenuSep, SearchInput,
} from '@/components/ui'
import { dateTime, mins, relative } from '@/lib/format'
import { STATUS_META, type PublishStatus, type SessionType } from '@/lib/types'

type SortKey = 'updated' | 'name' | 'scheduled' | 'code'

export default function SessionsList() {
  const db = useStore(s => s.db)
  const createSession = useStore(s => s.createSession)
  const duplicateSession = useStore(s => s.duplicateSession)
  const deleteSessions = useStore(s => s.deleteSessions)
  const setSessionStatus = useStore(s => s.setSessionStatus)
  const nav = useNavigate()

  const [q, setQ] = useState('')
  const [track, setTrack] = useState('')
  const [loop, setLoop] = useState('')
  const [type, setType] = useState<SessionType | ''>('')
  const [status, setStatus] = useState<PublishStatus | ''>('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [asc, setAsc] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirmDel, setConfirmDel] = useState(false)

  const loopsForTrack = useMemo(
    () => (track ? db.loops.filter(l => l.trackId === track) : db.loops),
    [db.loops, track],
  )
  useEffect(() => { if (loop && !loopsForTrack.some(l => l.id === loop)) setLoop('') }, [loopsForTrack, loop])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = db.sessions.filter(s => {
      const l = db.loops.find(x => x.id === s.loopId)
      if (track && l?.trackId !== track) return false
      if (loop && s.loopId !== loop) return false
      if (type && s.type !== type) return false
      if (status && s.status !== status) return false
      if (!needle) return true
      return (
        s.name.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        s.titles.some(t => t.name.toLowerCase().includes(needle))
      )
    })

    const dir = asc ? 1 : -1
    list = list.slice().sort((a, b) => {
      switch (sort) {
        case 'name': return a.name.localeCompare(b.name) * dir
        case 'code': return a.code.localeCompare(b.code) * dir
        case 'scheduled':
          return ((a.scheduledAt ?? '') < (b.scheduledAt ?? '') ? -1 : 1) * dir
        default:
          return (a.updatedAt < b.updatedAt ? -1 : 1) * dir
      }
    })
    return list
  }, [db, q, track, loop, type, status, sort, asc])

  const filtered = !!(q || track || loop || type || status)
  const allSel = rows.length > 0 && rows.every(r => sel.has(r.id))
  const someSel = sel.size > 0

  const toggleAll = () =>
    setSel(allSel ? new Set() : new Set(rows.map(r => r.id)))
  const toggle = (id: string) =>
    setSel(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const sortBy = (k: SortKey) => {
    if (sort === k) setAsc(a => !a)
    else { setSort(k); setAsc(k === 'name' || k === 'code') }
  }

  const clearFilters = () => { setQ(''); setTrack(''); setLoop(''); setType(''); setStatus('') }

  return (
    <div className="page">
      <PageHeader
        title="Sessions"
        actions={
          <button className="btn primary" onClick={() => { const s = createSession(); nav(`/admin/sessions/${s.id}`) }}>
            <Plus />New session
          </button>
        }
      />

      {/* ---- filter bar ---- */}
      <div className="card mb16" style={{ padding: 10 }}>
        <div className="row g8 wrap">
          <SearchInput value={q} onChange={setQ} placeholder="Search sessions, codes, titles…"
            className="grow" />

          <select className="sel" style={{ width: 'auto', minWidth: 132 }} value={track}
            onChange={e => setTrack(e.target.value)}>
            <option value="">All tracks</option>
            {db.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <select className="sel" style={{ width: 'auto', minWidth: 128 }} value={loop}
            onChange={e => setLoop(e.target.value)}>
            <option value="">All loops</option>
            {loopsForTrack.map(l => <option key={l.id} value={l.id}>{l.code}</option>)}
          </select>

          <select className="sel" style={{ width: 'auto' }} value={type}
            onChange={e => setType(e.target.value as SessionType | '')}>
            <option value="">Any type</option>
            <option value="recorded">Recorded</option>
            <option value="live">Live</option>
          </select>

          <select className="sel" style={{ width: 'auto' }} value={status}
            onChange={e => setStatus(e.target.value as PublishStatus | '')}>
            <option value="">Any status</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {filtered && (
            <button className="btn ghost sm" onClick={clearFilters}><X />Clear</button>
          )}
        </div>
      </div>

      {/* ---- bulk bar ---- */}
      {someSel && (
        <div className="card mb12 rise" style={{ padding: '8px 12px', borderColor: 'var(--brand)' }}>
          <div className="row g10 wrap">
            <Badge tone="brand">{sel.size} selected</Badge>
            <div className="vsep" />
            <button className="btn sm" onClick={() => { setSessionStatus([...sel], 'published'); setSel(new Set()) }}>
              <Send />Publish
            </button>
            <button className="btn sm" onClick={() => { setSessionStatus([...sel], 'draft'); setSel(new Set()) }}>
              <FileText />Move to draft
            </button>
            <button className="btn sm" onClick={() => { setSessionStatus([...sel], 'archived'); setSel(new Set()) }}>
              <Archive />Archive
            </button>
            <button className="btn sm danger" onClick={() => setConfirmDel(true)}><Trash2 />Delete</button>
            <button className="btn sm ghost auto-s" onClick={() => setSel(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {/* ---- table ---- */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <Empty
            icon={filtered ? <Filter /> : <Video />}
            title={filtered ? 'No session matches these filters' : 'No sessions yet'}
            action={filtered
              ? <button className="btn" onClick={clearFilters}>Clear filters</button>
              : <button className="btn primary" onClick={() => { const s = createSession(); nav(`/admin/sessions/${s.id}`) }}>
                  <Plus />New session
                </button>}
          />
        ) : (
          <div className="tbl-wrap" style={{ maxHeight: 'calc(100dvh - 300px)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input type="checkbox" className="cbx" checked={allSel}
                      ref={el => { if (el) el.indeterminate = someSel && !allSel }}
                      onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="sortable" onClick={() => sortBy('name')}>
                    <span className="row g4">Session {sort === 'name' && <ArrowUpDown style={{ width: 11, height: 11 }} />}</span>
                  </th>
                  <th className="sortable" onClick={() => sortBy('code')} style={{ width: 116 }}>Code</th>
                  <th style={{ width: 92 }}>Type</th>
                  <th style={{ width: 108 }}>Status</th>
                  <th style={{ width: 190 }}>Contents</th>
                  <th className="sortable" onClick={() => sortBy('scheduled')} style={{ width: 140 }}>Scheduled</th>
                  <th className="sortable num" onClick={() => sortBy('updated')} style={{ width: 96 }}>Updated</th>
                  <th className="act" />
                </tr>
              </thead>
              <tbody>
                {rows.map(s => {
                  const st = sessionStats(s)
                  const gaps = readiness(s)
                  const loopRec = db.loops.find(l => l.id === s.loopId)
                  const trackRec = db.tracks.find(t => t.id === loopRec?.trackId)
                  const selected = sel.has(s.id)

                  return (
                    <tr key={s.id} data-sel={selected}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="cbx" checked={selected}
                          onChange={() => toggle(s.id)} aria-label={`Select ${s.name}`} />
                      </td>

                      <td>
                        <Link to={`/admin/sessions/${s.id}`} className="stack g2" style={{ minWidth: 0 }}>
                          <div className="row g8">
                            <span className="t-sm w-sb truncate">{s.name}</span>
                            {gaps.length > 0 && s.status !== 'archived' && (
                              <Badge tone="rose" dot title={gaps.join(' · ')}>{gaps.length}</Badge>
                            )}
                            {gaps.length === 0 && s.status === 'published' && (
                              <CheckCircle2 style={{ width: 13, height: 13, color: 'var(--teal-500)' }} />
                            )}
                          </div>
                          <span className="t-xs c-muted2 truncate">
                            {trackRec?.name} · {loopRec?.code}
                          </span>
                        </Link>
                      </td>

                      <td><span className="mono t-xs c-muted">{s.code}</span></td>

                      <td>
                        <Badge tone={s.type === 'live' ? 'rose' : ''}>
                          {s.type === 'live' ? <Radio /> : <Video />}
                          {s.type === 'live' ? 'Live' : 'Recorded'}
                        </Badge>
                      </td>

                      <td>
                        <Badge tone={STATUS_META[s.status].tone} dot>{STATUS_META[s.status].label}</Badge>
                      </td>

                      <td>
                        <div className="row g10 t-xs c-muted tnum">
                          <span title="Topics and projects" className="row g4">
                            <ListChecks style={{ width: 12, height: 12 }} />
                            {st.topics}{st.projects > 0 && ` + ${st.projects}`}
                          </span>
                          <span title="Recordings ready" className="row g4"
                            style={{ color: st.missingVideo ? 'var(--gold-600)' : undefined }}>
                            <Video style={{ width: 12, height: 12 }} />{st.videos}/{st.topics}
                          </span>
                          <span title="Q&A tasks" className="row g4"><FileText style={{ width: 12, height: 12 }} />{st.tasks}</span>
                          <span title="Runtime" className="c-muted2">{mins(st.minutes)}</span>
                        </div>
                      </td>

                      <td>
                        <span className="t-xs c-muted tnum">{dateTime(s.scheduledAt)}</span>
                      </td>

                      <td className="num">
                        <span className="t-xs c-muted2">{relative(s.updatedAt)}</span>
                      </td>

                      <td className="act">
                        <div className="row g4">
                          <Link to={`/admin/sessions/${s.id}`} className="btn ghost icon sm" aria-label="Open">
                            <ChevronRight />
                          </Link>
                          <Menu trigger={p => (
                            <button className="btn ghost icon sm" {...p} aria-label="More"><MoreHorizontal /></button>
                          )}>
                            <MenuLabel>{s.code}</MenuLabel>
                            <MenuItem icon={<Video />} onClick={() => nav(`/admin/sessions/${s.id}`)}>Open editor</MenuItem>
                            <MenuItem icon={<Copy />} onClick={() => duplicateSession(s.id)}>Duplicate</MenuItem>
                            <MenuSep />
                            <MenuLabel>Status</MenuLabel>
                            <MenuItem icon={<Send />} onClick={() => setSessionStatus([s.id], 'published')}>Publish</MenuItem>
                            <MenuItem icon={<FileText />} onClick={() => setSessionStatus([s.id], 'draft')}>Move to draft</MenuItem>
                            <MenuItem icon={<Archive />} onClick={() => setSessionStatus([s.id], 'archived')}>Archive</MenuItem>
                            <MenuSep />
                            <MenuItem icon={<Trash2 />} danger onClick={() => deleteSessions([s.id])}>Delete</MenuItem>
                          </Menu>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="between mt12 t-xs c-muted2">
        <span>{rows.length} of {db.sessions.length} sessions</span>
        <span>Changes save to this browser as you type</span>
      </div>

      <Confirm
        open={confirmDel} onClose={() => setConfirmDel(false)}
        onConfirm={() => { deleteSessions([...sel]); setSel(new Set()) }}
        title={`Delete ${sel.size} session${sel.size > 1 ? 's' : ''}?`}
        body={<>This removes their titles, recordings, materials and Q&amp;A from this workspace. There is no undo in the dev build.</>}
        confirmLabel={`Delete ${sel.size}`}
      />
    </div>
  )
}
