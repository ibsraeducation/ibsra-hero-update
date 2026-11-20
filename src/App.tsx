import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Missions, MissionLoop, MissionTrack } from '@/roles/student/Missions'
import { SessionView } from '@/roles/student/SessionView'
import { StudentProgress } from '@/roles/student/Progress'
import { StudentMarketplace, StudentProductDetail } from '@/roles/student/Marketplace'
import { ParentSummary } from '@/roles/parent/Summary'
import { ParentProgram } from '@/roles/parent/Program'
import ParentPath from '@/roles/parent/Path'
import {
  ParentPerformance, PerformanceAssets, PerformanceCharacter, PerformanceLearning, PerformancePortfolio,
  StudentPerformance,
} from '@/roles/parent/Performance'
import { ParentMentorChat } from '@/roles/parent/MentorChat'
import { PerformanceAsk } from '@/roles/parent/Insight'
import { ParentMarketplace, ParentProductDetail } from '@/roles/parent/Marketplace'
import { ParentFamily } from '@/roles/parent/Family'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { Login } from '@/roles/auth/Login'
import { SignUp } from '@/roles/auth/SignUp'
import { ChangePassword } from '@/roles/auth/ChangePassword'
/* The live parent area: a real family account, not the demo report. */
import { ParentChildren } from '@/roles/parent/live/Children'
import { ParentMaterial } from '@/roles/parent/live/Material'
import { ParentFeedback } from '@/roles/parent/live/Feedback'
import { ParentWallet } from '@/roles/parent/live/Wallet'
import { ParentPayments } from '@/roles/parent/live/Payments'
import { ProgramPage } from '@/roles/marketplace/live/ProgramPage'
import { useAuth } from '@/lib/auth'
import { useHistoryTrail } from '@/lib/backNav'
import { backendLive } from '@/lib/supabase'

/* The admin surface is the heavy one — split it so a role switch into
   student or parent never pays for the CMS bundle. */
const Material = lazy(() => import('@/roles/admin/Material'))
const SessionEditor = lazy(() => import('@/roles/admin/editor/SessionEditor'))
const MentorFeedback = lazy(() => import('@/roles/admin/MentorFeedback'))
const StudentsAndPayments = lazy(() => import('@/roles/admin/StudentsAndPayments'))
const AdminRequests = lazy(() => import('@/roles/admin/Requests'))
const AdminPrograms = lazy(() => import('@/roles/admin/Programs'))
const StudentCalendar = lazy(() => import('@/roles/student/Calendar'))
const ParentCalendar = lazy(() => import('@/roles/parent/live/Calendar'))
const Notifications = lazy(() => import('@/roles/shared/Notifications'))

/* Paying moved into Payments as its first tab, so the old page keeps the
   query it was given — `?student=` is how every "pay for this hero" button
   in the app picks whom it is for. */
function ToPayments() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/parent/payments', search }} replace />
}

/* Admin Payments is a tab of Students & payments now. The old address keeps
   its filter (`?show=`) and lands on the tab it named, Transfers if none. */
function PaymentsRedirect() {
  const p = new URLSearchParams(useLocation().search)
  if (!p.get('tab')) p.set('tab', 'transfers')
  return <Navigate to={{ pathname: '/admin/students', search: `?${p}` }} replace />
}

/* The admin calendar is a tab of the same page — it is read next to the
   payment that books onto it. */
function CalendarRedirect() {
  return <Navigate to="/admin/students?tab=calendar" replace />
}

/* The Marketplace is off for a signed-in family and student for now:
   programs are enrolled from Material, and kits are not on sale yet. The
   kits board is still in roles/marketplace/live/Board.tsx for when they are.
   The no-backend demo keeps its seeded catalogue. */
function MarketplaceForAccount() {
  return backendLive ? <Navigate to="/parent/material" replace /> : <ParentMarketplace />
}

function StudentMarketplaceForAccount() {
  return backendLive ? <Navigate to="/student/missions" replace /> : <StudentMarketplace />
}

/* The demo listing detail belongs to the demo catalogue, so a family lands
   back on theirs rather than on a product that is not for sale. */
function ProductDetailForAccount() {
  const accountRole = useAuth(s => s.profile?.role)
  return backendLive && accountRole === 'parent'
    ? <Navigate to="/parent/marketplace" replace />
    : <ParentProductDetail />
}

function PageSkeleton() {
  return (
    <div className="page">
      <div className="skel mb20" style={{ height: 30, width: 220 }} />
      <div className="grid g-4 mb20">
        {[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 104 }} />)}
      </div>
      <div className="skel" style={{ height: 300 }} />
    </div>
  )
}

export default function App() {
  /* What every history entry holds, so an in-app Back can step back. */
  useHistoryTrail()
  return (
    <Routes>
      {/* Outside the shell: signing in, and choosing a password. With no
          backend both send you straight back into the demo. */}
      <Route path="login" element={<Login />} />
      {/* The only page anybody can open without an account: a parent makes one. */}
      <Route path="signup" element={<SignUp />} />
      <Route path="account/password" element={<ChangePassword />} />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="/admin/material" replace />} />

        {/* One inbox, read by whoever is signed in — see the bell in AppShell. */}
        <Route path="notifications"
          element={<Suspense fallback={<PageSkeleton />}><Notifications /></Suspense>} />

        {/* ---------- admin ----------
            One surface, three steps deep:
            program → course → sessions, then the editor per session. */}
        <Route path="admin" element={<Navigate to="/admin/material" replace />} />
        <Route path="admin/material" element={<Suspense fallback={<PageSkeleton />}><Material /></Suspense>} />
        <Route path="admin/material/:trackId" element={<Suspense fallback={<PageSkeleton />}><Material /></Suspense>} />
        <Route path="admin/material/:trackId/:loopId" element={<Suspense fallback={<PageSkeleton />}><Material /></Suspense>} />
        <Route path="admin/material/:trackId/:loopId/:sessionId"
          element={<Suspense fallback={<PageSkeleton />}><SessionEditor /></Suspense>} />
        {/* Work used to be a second area beside Material, with its own three
            levels. It is a course kind now, so its programs are ordinary
            programs and its old links land on Material. */}
        <Route path="admin/work/*" element={<Navigate to="/admin/material" replace />} />
        {/* The Marketplace (kits) is off for the admin too; the page stays in
            roles/admin/Marketplace.tsx for when kits go on sale. */}
        <Route path="admin/marketplace" element={<Navigate to="/admin/material" replace />} />
        {/* The daily note parents read on the performance overview, and their questions. */}
        <Route path="admin/feedback"
          element={<Suspense fallback={<PageSkeleton />}><MentorFeedback /></Suspense>} />
        {/* Student accounts and answers to grade, next to what families sent
            and the button that enrols their student — one page, four tabs. */}
        <Route path="admin/students"
          element={<Suspense fallback={<PageSkeleton />}><StudentsAndPayments /></Suspense>} />
        {/* What families asked for, and the courses answering it opens. */}
        <Route path="admin/requests"
          element={<Suspense fallback={<PageSkeleton />}><AdminRequests /></Suspense>} />
        {/* Old links (and notices already sent) land on the payments tab. */}
        <Route path="admin/payments" element={<PaymentsRedirect />} />
        {/* Every scheduled sitting, and where the admin sets the weekly windows they come from. */}
        <Route path="admin/programs"
          element={<Suspense fallback={<PageSkeleton />}><AdminPrograms /></Suspense>} />
        <Route path="admin/calendar" element={<CalendarRedirect />} />

        <Route path="admin/*" element={<Navigate to="/admin/material" replace />} />

        {/* The instructor workspace is gone — a mentor is a person sessions and
            cohorts are assigned to, not a dashboard. Old links land on Admin. */}
        <Route path="instructor/*" element={<Navigate to="/admin/material" replace />} />

        {/* ---------- student ----------
            Four surfaces. Missions is the folder tree:
            program → course → session → the session view. */}
        <Route path="student" element={<Navigate to="/student/missions" replace />} />
        <Route path="student/missions" element={<Missions />} />
        <Route path="student/missions/:trackId" element={<MissionTrack />} />
        <Route path="student/missions/:trackId/:loopId" element={<MissionLoop />} />
        {/* Work courses sit in Missions with the training ones now — one tree,
            marked by kind. Old links land there. */}
        <Route path="student/work/*" element={<Navigate to="/student/missions" replace />} />
        <Route path="student/session/:sessionId" element={<SessionView />} />
        {/* The student's own record: the charts, the projects they have built
            and the mentor's notes on them. */}
        <Route path="student/progress" element={<StudentProgress />} />
        {/* Same five pages and slicer as the parent's, on the student's own record. */}
        <Route path="student/performance" element={<StudentPerformance />}>
          <Route index element={<Navigate to="learning" replace />} />
          <Route path="learning" element={<PerformanceLearning />} />
          <Route path="character" element={<PerformanceCharacter />} />
          <Route path="portfolio" element={<PerformancePortfolio />} />
          <Route path="assets" element={<PerformanceAssets />} />
          <Route path="ask" element={<PerformanceAsk />} />
          <Route path="*" element={<Navigate to="/student/performance/learning" replace />} />
        </Route>
        {/* Financial Analysis was taken out of the student rail; an old link lands on Missions. */}
        <Route path="student/financial" element={<Navigate to="/student/missions" replace />} />
        <Route path="student/marketplace" element={<StudentMarketplaceForAccount />} />
        <Route path="student/marketplace/program/:trackId" element={<ProgramPage audience="student" />} />
        <Route path="student/calendar" element={<Suspense fallback={<PageSkeleton />}><StudentCalendar /></Suspense>} />
        <Route path="student/marketplace/:productId" element={<StudentProductDetail />} />
        {/* A student has a wallet of their own, on the same page a parent
            uses. Paying itself is the parent's business. */}
        <Route path="student/wallet" element={<ParentWallet />} />

        {/* ---------- parent ----------
            Three surfaces: the summary is the whole report in one screen,
            and the other two are the pages it summarises. */}
        <Route path="parent" element={<ParentSummary />} />
        {/* Each folder on the summary opens its program on a page of its own. */}
        <Route path="parent/path" element={<ParentPath />} />
        <Route path="parent/program/:trackId" element={<ParentProgram />} />
        {/* Performance is five pages under one slicer; the slice rides in the query. */}
        <Route path="parent/performance" element={<ParentPerformance />}>
          <Route index element={<Navigate to="learning" replace />} />
          <Route path="learning" element={<PerformanceLearning />} />
          <Route path="character" element={<PerformanceCharacter />} />
          <Route path="portfolio" element={<PerformancePortfolio />} />
          <Route path="assets" element={<PerformanceAssets />} />
          <Route path="ask" element={<PerformanceAsk />} />
          <Route path="*" element={<Navigate to="/parent/performance/learning" replace />} />
        </Route>
        {/* Where the progress assistant hands a question it should not answer. */}
        <Route path="parent/mentor" element={<ParentMentorChat />} />
        <Route path="parent/marketplace" element={<MarketplaceForAccount />} />
        {/* Programs are enrolled from Material now; the Marketplace is kits. */}
        <Route path="parent/marketplace/program/:trackId" element={<Navigate to="/parent/material" replace />} />
        <Route path="parent/calendar" element={<Suspense fallback={<PageSkeleton />}><ParentCalendar /></Suspense>} />
        <Route path="parent/marketplace/:productId" element={<ProductDetailForAccount />} />
        <Route path="parent/family" element={<ParentFamily />} />
        {/* ---------- the live parent area ----------
            What a signed-in family has: the material their child opens, the
            heroes on the account, and Payments — buying and what was filed,
            two tabs of one page. The wallet is reached from the top bar and
            the mentor's feedback from the hero it is about, so neither needs
            a rail entry of its own. */}
        <Route path="parent/material" element={<ParentMaterial />} />
        <Route path="parent/heroes" element={<ParentChildren />} />
        <Route path="parent/feedback" element={<ParentFeedback />} />
        <Route path="parent/wallet" element={<ParentWallet />} />
        <Route path="parent/payments" element={<ParentPayments />} />
        {/* the two pages these replaced, kept so old links land right. */}
        <Route path="parent/children" element={<Navigate to="/parent/heroes" replace />} />
        <Route path="parent/enroll" element={<ToPayments />} />
        {/* the pre-split routes, kept so old links land somewhere right. His
            Quarter and Investment Analysis are gone; both land on the summary. */}
        <Route path="parent/progress" element={<Navigate to="/parent/performance" replace />} />
        <Route path="parent/quarter" element={<Navigate to="/parent" replace />} />
        <Route path="parent/investment" element={<Navigate to="/parent" replace />} />

        <Route path="*" element={<Navigate to="/admin/material" replace />} />
      </Route>
    </Routes>
  )
}
