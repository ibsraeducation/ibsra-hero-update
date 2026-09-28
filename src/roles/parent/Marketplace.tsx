/* ==========================================================================
   Parent · Marketplace

   The same catalogue the student sees, with the parent's question in front
   of it: what would this cost, does it fit my child's age, and what does the
   program they are already on still have left in it.

   The prices, seats and dates are the identical rows — one catalogue, so a
   parent and their child can never be quoted two different numbers.
   ========================================================================== */

import { Link } from 'react-router-dom'
import { ChevronRight, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StageNote } from '../shared'
import { Catalog, EnrolmentNote } from '../marketplace/Catalog'
import { ProductDetail } from '../marketplace/ProductDetail'
import { useParent } from './data'

const BASE = '/parent/marketplace'

export function ParentMarketplace() {
  const d = useParent()

  return (
    <div className="page">
      <PageHeader
        title="Marketplace"
        actions={
          <Link className="btn" to="/parent"><Wallet />Reporting summary<ChevronRight /></Link>
        }
      />

      <Catalog
        audience="parent"
        basePath={BASE}
        enrolledTrackId={d.child.trackId}
        age={d.child.age}
        emptyBody="Nothing is listed in this category yet. New listings appear here as soon as they go live." />

      <EnrolmentNote audience="parent" />

      <StageNote>
        The catalogue itself is real store data — every price, date and seat count on this page is
        what the admin entered. Checkout is not built: asking about a listing records interest in
        this browser and nothing is charged, invoiced or reserved.
      </StageNote>
    </div>
  )
}

export function ParentProductDetail() {
  const d = useParent()
  return (
    <ProductDetail
      audience="parent"
      basePath={BASE}
      enrolledTrackId={d.child.trackId}
      age={d.child.age}
    />
  )
}
