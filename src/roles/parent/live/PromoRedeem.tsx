import { useState } from 'react'
import { Loader2, Ticket } from 'lucide-react'
import { Modal } from '@/components/ui'
import { toMessage } from '@/lib/api/errors'
import { normalizeCode, redeemPromo, validCode } from '@/lib/api/promo'
import { useStore } from '@/lib/store'

/* A promo code, typed in: it opens the course (or program) for the hero
   picked above, for free. */
export function PromoRedeem({ studentId, heroName, onDone }: {
  studentId: string
  heroName: string
  onDone: () => void
}) {
  const toast = useStore(s => s.toast)
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => { setOpen(false); setCode(''); setError(null) }

  const redeem = async () => {
    setBusy(true); setError(null)
    try {
      await redeemPromo(code, studentId)
      toast(`Opened for ${heroName}`)
      close()
      onDone()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}><Ticket />Promo code</button>
      {open && (
        <Modal
          open
          onClose={close}
          title="Promo code"
          footer={
            <>
              <span className="grow" />
              <button className="btn ghost" onClick={close}>Cancel</button>
              <button className="btn primary" disabled={!validCode(code) || busy} onClick={redeem}>
                {busy && <Loader2 className="spin" />}Redeem
              </button>
            </>
          }
        >
          <input className="inp" autoFocus value={code} placeholder="Code" aria-label="Promo code"
            style={{ textTransform: 'uppercase' }} maxLength={32}
            onChange={e => setCode(normalizeCode(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter' && validCode(code) && !busy) void redeem() }} />
          {error && <div className="auth-alert mt12" role="alert"><span>{error}</span></div>}
        </Modal>
      )}
    </>
  )
}
