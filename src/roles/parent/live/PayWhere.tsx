/* ==========================================================================
   Where to send it — the same two cards wherever a family is about to pay.

   Each open channel shows the link that opens the app ready to pay, the QR
   to scan from another phone, and — for InstaPay — the address itself. A
   channel the admin has closed is not shown at all.
   ========================================================================== */

import { CreditCard, ExternalLink, Smartphone } from 'lucide-react'
import { openChannels, qrUrl } from '@/lib/api/billing'
import type { PayAccountsRow } from '@/lib/api/rows'
import '@/roles/admin/billing.css'

function Card({ icon: Icon, title, value, link, qr, stamp }: {
  icon: typeof CreditCard
  title: string
  value: string
  link: string
  qr: string | null
  stamp: string
}) {
  const src = qrUrl(qr, stamp)
  return (
    <div className="bill-pay-card">
      <span className="eyebrow row g6"><Icon style={{ width: 13, height: 13 }} />{title}</span>
      {value && <b className="t-md">{value}</b>}
      {src && (
        <div className="bill-qr-frame">
          <img src={src} alt={`${title} QR code`} />
        </div>
      )}
      {link && (
        <a className="btn sm" href={link} target="_blank" rel="noopener noreferrer">
          <ExternalLink />Open {title}
        </a>
      )}
      {!value && !src && !link && (
        <span className="t-xs c-muted2">Ask the admin where to send it.</span>
      )}
    </div>
  )
}

export function PayWhere({ accounts }: { accounts: PayAccountsRow | null }) {
  const open = openChannels(accounts)

  if (!open.length) {
    return (
      <p className="t-sm c-muted" style={{ lineHeight: 1.6 }}>
        No way of paying is open right now. Ask the admin how to send it.
      </p>
    )
  }

  return (
    <>
      <div className="bill-pay">
        {open.includes('instapay') && (
          <Card icon={CreditCard} title="InstaPay" value=""
            link={accounts?.instapay_link?.trim() ?? ''} qr={accounts?.instapay_qr ?? null}
            stamp={accounts?.updated_at ?? ''} />
        )}
        {open.includes('vodafone_cash') && (
          <Card icon={Smartphone} title="Vodafone Cash" value=""
            link={accounts?.vodafone_link?.trim() ?? ''} qr={accounts?.vodafone_qr ?? null}
            stamp={accounts?.updated_at ?? ''} />
        )}
      </div>
      {accounts?.instructions && (
        <p className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>{accounts.instructions}</p>
      )}
    </>
  )
}
