/* ==========================================================================
   Students & payments — one rail entry for the people and their money.

   The two were separate pages, but the admin moves between them all the
   time: a transfer comes in for a student, accepting it opens that
   student's program and asks for their week, and the answer is checked on
   the student's record. So they are tabs of one page now:

   · Students — accounts, their courses, and the answers to grade.
   · Payments — transfers to check (and the schedule step after accepting).
   · Calendar — the sittings accepting those transfers booked.
   · Transfer to a wallet — money the admin puts on a wallet themselves.
   · Payment settings — the channels families pay into, and the packages.

   The tab lives in the URL (`?tab=`); the old `/admin/payments` links
   redirect here with the tab they meant (see App.tsx).
   ========================================================================== */

import { useSearchParams } from 'react-router-dom'
import { CalendarDays, MessageSquare, Receipt, Settings2, Users, WalletCards } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs } from '@/components/ui'
import { useAdminQueue } from '@/lib/api/adminQueue'
import { StudentsPanel } from './Students'
import { PaymentsPanel, type PayTab } from './Payments'
import { CalendarPanel } from './Calendar'
import { ScoreboardPanel } from './Scoreboard'
import './wallets.css'

type Tab = 'students' | 'calendar' | 'feedback' | PayTab

const TABS: readonly Tab[] = ['students', 'transfers', 'calendar', 'feedback', 'wallets', 'settings']
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab)

export default function StudentsAndPayments() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = isTab(raw) ? raw : 'students'
  const grading = useAdminQueue(s => s.grading)
  const payments = useAdminQueue(s => s.payments)

  const go = (next: Tab) => {
    const p = new URLSearchParams(params)
    p.set('tab', next)
    /* The Waiting/All filter belongs to the payments list; it is dropped on the way out. */
    if (next !== 'transfers') p.delete('show')
    /* A tab is a step the browser's Back returns to, not one it skips. */
    setParams(p)
  }

  return (
    <div className="page">
      <PageHeader title="Students & payments" />

      <div className="pay-tabs mb14">
        <Tabs<Tab>
          value={tab}
          onChange={go}
          items={[
            { value: 'students', label: 'Students', icon: <Users />, count: grading || undefined },
            { value: 'transfers', label: 'Payments', icon: <Receipt />, count: payments || undefined },
            { value: 'calendar', label: 'Calendar', icon: <CalendarDays /> },
            { value: 'feedback', label: 'Students feedback', icon: <MessageSquare /> },
            { value: 'wallets', label: 'Transfer to a wallet', icon: <WalletCards /> },
            { value: 'settings', label: 'Payment settings', icon: <Settings2 /> },
          ]}
        />
      </div>

      {tab === 'students' ? <StudentsPanel />
        : tab === 'calendar' ? <CalendarPanel />
          : tab === 'feedback' ? <ScoreboardPanel />
            : <PaymentsPanel tab={tab} />}
    </div>
  )
}
