/* ==========================================================================
   The wallet in the top bar, for a parent or a student — each has their own.

   The balance used to live one click away, on a rail entry of its own. It
   belongs where a family can read it while they are looking at something
   else — what is on the account decides whether the next payment is one tap
   or a transfer, so it sits beside the renewal clock and stays there.

   Tapping it opens the wallet page, which is where money is put on and every
   movement is listed. The figure is re-read on each navigation: paying out
   of the wallet lands on another page, and the chip has to be honest by the
   time it gets there.
   ========================================================================== */

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { backendLive } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { fetchWallet } from '@/lib/api/wallet'
import { money } from '@/lib/format'
import './walletchip.css'

export function WalletChip() {
  const role = useAuth(s => s.profile?.role)
  const userId = useAuth(s => s.profile?.id)
  const [balance, setBalance] = useState<number | null>(null)
  const loc = useLocation()

  useEffect(() => {
    if (!backendLive || (role !== 'parent' && role !== 'student') || !userId) { setBalance(null); return }
    let live = true
    void (async () => {
      try {
        const w = await fetchWallet(userId)
        if (live) setBalance(w.balance_egp)
      } catch {
        /* The top bar is not the place to report a failed read. */
      }
    })()
    return () => { live = false }
  }, [role, userId, loc.pathname])

  if (balance === null) return null

  return (
    <Link
      to={role === 'student' ? '/student/wallet' : '/parent/wallet'}
      className="wl-pill"
      data-empty={balance <= 0}
      title={balance > 0
        ? `${money(balance)} on your account — enough to pay without sending a transfer`
        : 'Your wallet is empty — charge it and the next payment takes a single tap'}
    >
      <Wallet />
      <span className="tnum">{money(balance)}</span>
      <span className="wl-what hide-sm">· Wallet</span>
    </Link>
  )
}
