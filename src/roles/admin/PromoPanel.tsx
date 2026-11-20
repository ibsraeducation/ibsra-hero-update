/* ==========================================================================
   Promo codes — a code that opens a course for free.

   The admin picks what it opens (one course, or a whole program), and
   decides whether it ever expires with a switch: off means it runs until
   the admin turns it off; on shows the date it stops. Each code also has
   its own on/off, so one can be stopped at once without touching its date.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dices, Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge, Empty, Switch } from '@/components/ui'
import { dateTime, fromLocalInput, toLocalInput } from '@/lib/format'
import { toMessage } from '@/lib/api/errors'
import {
  createPromo, deletePromo, generateCode, listPromos, normalizeCode, promoLive, updatePromo,
  validCode, type PromoRow,
} from '@/lib/api/promo'
import { useStore } from '@/lib/store'

/** A day from now at the same hour — where a new expiry starts, so turning
 *  the switch on never leaves an empty date. */
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString()

export function PromoPanel() {
  const tracks = useStore(s => s.db.tracks)
  const loops = useStore(s => s.db.loops)
  const toast = useStore(s => s.toast)

  const [rows, setRows] = useState<PromoRow[] | null>(null)
  const [code, setCode] = useState('')
  const [target, setTarget] = useState('')
  const [expires, setExpires] = useState(false)
  const [when, setWhen] = useState(() => toLocalInput(tomorrow()))
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setRows(await listPromos()) } catch (e) { toast(toMessage(e), 'err'); setRows([]) }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const nameOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tracks) m.set(`t:${t.id}`, t.name)
    for (const l of loops) m.set(`l:${l.id}`, l.name)
    return (p: PromoRow) => (p.loop_id ? m.get(`l:${p.loop_id}`) : m.get(`t:${p.track_id}`)) ?? '—'
  }, [tracks, loops])

  const add = async () => {
    const [kind, id] = target.split(':')
    setBusy(true)
    try {
      await createPromo({
        code,
        ...(kind === 't' ? { trackId: id } : { loopId: id }),
        expiresAt: expires ? fromLocalInput(when) : null,
      })
      setCode('')
      toast('Promo code added')
      await load()
    } catch (e) {
      toast(toMessage(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const patch = async (p: PromoRow, part: Partial<Pick<PromoRow, 'active' | 'expires_at'>>) => {
    setRows(rs => rs && rs.map(r => (r.id === p.id ? { ...r, ...part } : r)))
    try { await updatePromo(p.id, part) } catch (e) { toast(toMessage(e), 'err'); await load() }
  }

  const remove = async (p: PromoRow) => {
    try { await deletePromo(p.id); await load() } catch (e) { toast(toMessage(e), 'err') }
  }

  const ready = validCode(code) && !!target && (!expires || !!when)

  return (
    <div className="stack g20">
      <div className="card" style={{ padding: 20 }}>
        <div className="row g12 wrap" style={{ alignItems: 'center' }}>
          <input className="inp" style={{ width: 200, textTransform: 'uppercase' }} value={code}
            placeholder="Code" aria-label="Code" maxLength={32}
            onChange={e => setCode(normalizeCode(e.target.value))} />
          <button className="btn" onClick={() => setCode(generateCode())}><Dices />Generate</button>

          <select className="sel" style={{ width: 260 }} value={target} aria-label="Opens"
            onChange={e => setTarget(e.target.value)}>
            <option value="">Opens…</option>
            {tracks.map(t => (
              <optgroup key={t.id} label={t.name}>
                <option value={`t:${t.id}`}>Whole program</option>
                {loops.filter(l => l.trackId === t.id).sort((a, b) => a.index - b.index).map(l => (
                  <option key={l.id} value={`l:${l.id}`}>{l.name}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <label className="row g8" style={{ cursor: 'pointer' }}>
            <Switch on={expires} onChange={setExpires} label="Expires" />
            <span className="t-sm">Expires</span>
          </label>
          {expires && (
            <input className="inp" type="datetime-local" style={{ width: 'auto' }} value={when}
              aria-label="Expiry date" onChange={e => setWhen(e.target.value)} />
          )}

          <span className="grow" />
          <button className="btn primary" disabled={!ready || busy} onClick={add}>
            {busy ? <Loader2 className="spin" /> : <Plus />}Add code
          </button>
        </div>
      </div>

      {rows === null ? (
        <div className="card" style={{ padding: 28 }}><Loader2 className="spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card"><Empty icon={<Dices />} title="No promo codes yet" /></div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th><th>Opens</th><th>Used</th><th>On</th><th>Expires</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const hasDate = p.expires_at !== null
                const live = promoLive(p)
                return (
                  <tr key={p.id}>
                    <td className="w-sb tnum">{p.code}</td>
                    <td>{nameOf(p)}</td>
                    <td className="tnum">{p.redeemed_count}</td>
                    <td>
                      <Switch on={p.active} label={`${p.code} on`} onChange={v => patch(p, { active: v })} />
                    </td>
                    <td>
                      <span className="row g8">
                        <Switch on={hasDate} label={`${p.code} expires`}
                          onChange={v => patch(p, { expires_at: v ? tomorrow() : null })} />
                        {hasDate && (
                          <input className="inp" type="datetime-local" style={{ width: 'auto' }}
                            aria-label="Expiry date" value={toLocalInput(p.expires_at)}
                            onChange={e => { const v = fromLocalInput(e.target.value); if (v) void patch(p, { expires_at: v }) }} />
                        )}
                      </span>
                    </td>
                    <td>
                      {live
                        ? <Badge tone="teal" dot>Live</Badge>
                        : <Badge tone="line">{p.active ? `Expired ${dateTime(p.expires_at)}` : 'Off'}</Badge>}
                    </td>
                    <td>
                      <button className="btn ghost icon sm" aria-label={`Delete ${p.code}`}
                        style={{ color: 'var(--rose-600)' }} onClick={() => remove(p)}>
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
