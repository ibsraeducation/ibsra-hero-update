/* ==========================================================================
   The marketplace catalogue, on the server.

   Listings used to live in the admin's own browser, which is why a family
   never saw one: nothing ever left that browser. They are rows now, and this
   module is the only door to them.

   Reading is decided by the database, not by the caller: `products_select`
   hands an admin every row and everybody else only the published ones. So
   `fetchProducts()` is safe to call from a family page — it cannot return a
   draft — and the admin page gets its drafts from the same call.

   Writing is the admin's, enforced the same way.
   ========================================================================== */

import { backendLive, sb } from '@/lib/supabase'
import type { DeliveryMode, Product, ProductCategory, ProductStatus } from '@/lib/types'
import type { PaymentRow } from './rows'

export interface ProductRow {
  id: string
  category: ProductCategory
  name: string
  summary: string
  status: ProductStatus
  price_egp: number | null
  track_id: string | null
  loop_id: string | null
  instructor_id: string | null
  age_min: number
  age_max: number
  seats: number
  seats_taken: number
  start_date: string | null
  end_date: string | null
  duration: string
  delivery: DeliveryMode
  location: string
  highlights: string[]
  description: string
  skill: string
  price_per_course_egp: number | null
  installments: number
  deposit_egp: number
  upfront_discount: number
  thumbnail: string
  color: string
  created_at?: string
  updated_at?: string
}

/* ---------------- rows ↔ listings ---------------- */

export const productFromRow = (r: ProductRow): Product => ({
  id: r.id,
  category: r.category,
  name: r.name ?? '',
  summary: r.summary ?? '',
  status: r.status,
  price: r.price_egp,
  trackId: r.track_id,
  loopId: r.loop_id,
  instructorId: r.instructor_id,
  ageMin: r.age_min,
  ageMax: r.age_max,
  seats: r.seats,
  seatsTaken: r.seats_taken,
  startDate: r.start_date,
  endDate: r.end_date,
  duration: r.duration ?? '',
  delivery: r.delivery,
  location: r.location ?? '',
  highlights: r.highlights ?? [],
  description: r.description ?? '',
  skill: r.skill ?? '',
  pricePerCourse: r.price_per_course_egp,
  installments: r.installments ?? 1,
  deposit: r.deposit_egp ?? 0,
  upfrontDiscount: r.upfront_discount ?? 0,
  thumbnail: r.thumbnail ?? '',
  color: r.color || 'brand',
  createdAt: r.created_at ?? '',
  updatedAt: r.updated_at ?? '',
})

/* `created_at` and `updated_at` are the database's to decide, so they are not
   sent: a browser clock must never be what dates a listing. */
export const productToRow = (p: Product): Omit<ProductRow, 'created_at' | 'updated_at'> => ({
  id: p.id,
  category: p.category,
  name: p.name ?? '',
  summary: p.summary ?? '',
  status: p.status,
  price_egp: p.price ?? null,
  track_id: p.trackId || null,
  loop_id: p.loopId || null,
  instructor_id: p.instructorId || null,
  age_min: p.ageMin,
  age_max: p.ageMax,
  seats: p.seats,
  seats_taken: p.seatsTaken,
  start_date: p.startDate,
  end_date: p.endDate,
  duration: p.duration ?? '',
  delivery: p.delivery,
  location: p.location ?? '',
  highlights: p.highlights ?? [],
  description: p.description ?? '',
  skill: p.skill ?? '',
  price_per_course_egp: p.pricePerCourse ?? null,
  installments: p.installments ?? 1,
  deposit_egp: p.deposit ?? 0,
  upfront_discount: p.upfrontDiscount ?? 0,
  thumbnail: p.thumbnail ?? '',
  color: p.color || 'brand',
})

/* ---------------- reading ---------------- */

/** Every listing this account may see — all of them for an admin, the
 *  published ones for anybody else. The filter is the database's. */
export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await sb()
    .from('products').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as ProductRow[]).map(productFromRow)
}

/* ---------------- writing (admin) ---------------- */

/** Create or overwrite one listing. The whole row goes up: the editor holds
 *  the listing in full, so a partial write could only ever lose a field. */
export async function saveProduct(p: Product): Promise<Product> {
  const { data, error } = await sb()
    .from('products').upsert(productToRow(p)).select('*').single()
  if (error) throw error
  return productFromRow(data as ProductRow)
}

export async function saveProducts(list: Product[]): Promise<void> {
  if (list.length === 0) return
  const { error } = await sb().from('products').upsert(list.map(productToRow))
  if (error) throw error
}

export async function deleteProducts(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await sb().from('products').delete().in('id', ids)
  if (error) throw error
}

export async function setProductStatus(ids: string[], status: ProductStatus): Promise<void> {
  if (ids.length === 0) return
  const { error } = await sb().from('products').update({ status }).in('id', ids)
  if (error) throw error
}

/* ---------------- buying a kit (family) ---------------- */

/** One kit, for one hero, out of the family wallet. The server reads the
 *  price and the stock from its own table — nothing here is trusted — and
 *  the order comes back already approved, because the money in a wallet was
 *  checked on the way in. */
export async function buyKitFromWallet(productId: string, studentId: string): Promise<PaymentRow> {
  const { data, error } = await sb().rpc('buy_kit_from_wallet', {
    p_product: productId,
    p_student: studentId,
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as PaymentRow
}

/** The admin ticking off a kit they have handed over. */
export async function markKitHandedOver(paymentId: string): Promise<void> {
  const { error } = await sb()
    .from('payments').update({ fulfilled_at: new Date().toISOString() }).eq('id', paymentId)
  if (error) throw error
}

/** How many kits are paid for but not yet in a hero's hands — for the rail
 *  badge. A kit order is born `approved`, so it never shows in the payments
 *  "Waiting" count; this is its own queue. */
export async function owedKitCount(): Promise<number> {
  if (!backendLive) return 0
  const { count, error } = await sb().from('payments')
    .select('id', { count: 'exact', head: true }).eq('kind', 'kit').is('fulfilled_at', null)
  if (error) throw error
  return count ?? 0
}
