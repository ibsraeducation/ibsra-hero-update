import { PageHeader } from '@/components/layout/PageHeader'
import { Catalog, EnrolmentNote } from '../marketplace/Catalog'
import { ProductDetail } from '../marketplace/ProductDetail'
import { useMe } from './useMe'

/* ------------------------------------------------------------------ *
   MarketPlace is where a student picks up something they do not already
   have. Everything on it is a listing the admin created in the CMS —
   training programs and kits — and only the ones that have been listed appear here, the
   same gate a session goes through before a student can open it.

   Joining is still a request, not a checkout: prices are shown because
   the admin sets them, but payment and enrolment happen with the mentor
   outside the platform and the page says so.
 * ------------------------------------------------------------------ */

const BASE = '/student/marketplace'

export function StudentMarketplace() {
  const { me, trackId } = useMe()

  return (
    <div className="page">
      <PageHeader
        title="MarketPlace" />

      <Catalog
        audience="student"
        basePath={BASE}
        enrolledTrackId={trackId}
        age={me.age}
        emptyBody="Nothing is listed in this category yet. New listings show up here the moment your mentor puts them live." />

      <EnrolmentNote audience="student" />
    </div>
  )
}

export function StudentProductDetail() {
  const { me, trackId } = useMe()
  return (
    <ProductDetail
      audience="student"
      basePath={BASE}
      enrolledTrackId={trackId}
      age={me.age}
      missionsPath="/student/missions" />
  )
}
