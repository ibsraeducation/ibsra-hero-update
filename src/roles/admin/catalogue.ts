/* ==========================================================================
   The catalogue, between the editor and the table.

   The Marketplace page keeps editing listings through the store — that is
   what makes it feel instant, and it is the same store the demo build runs
   on with no backend at all. What changed is where they end up: with a
   backend configured, every write is mirrored to `products`, which is what a
   family reads. Without one, these are the store actions and nothing else,
   so the demo still works offline.

   Order is deliberate. The store moves first so the screen never waits, then
   the row goes up; a refusal reloads the server's copy over the top, which
   is the rollback. A listing the admin thinks they saved and the database
   never got is the one outcome worth this much care.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { backendLive } from '@/lib/supabase'
import { toMessage } from '@/lib/api/errors'
import * as api from '@/lib/api/products'
import type { Product, ProductStatus } from '@/lib/types'

/** Pull the catalogue into the store, replacing whatever was in it. */
export async function reloadCatalogue(): Promise<void> {
  if (!backendLive) return
  const list = await api.fetchProducts()
  useStore.setState(s => ({ db: { ...s.db, products: list } }))
}

/** A failed write is not a state the screen may keep: say so, and put the
 *  server's version back. */
async function afterFailure(e: unknown) {
  useStore.getState().toast(toMessage(e), 'err')
  try { await reloadCatalogue() } catch { /* the reload is best effort */ }
}

/** The listings this account may see, loaded once. An admin gets the drafts
 *  too — that filter is the database's, not this hook's. */
export function useCatalogue() {
  const products = useStore(s => s.db.products)
  const [loading, setLoading] = useState(backendLive)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!backendLive) { setLoading(false); return }
    try {
      await reloadCatalogue()
      setError(null)
    } catch (e) {
      setError(toMessage(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  return { products, loading, error, reload }
}

/* ---------------- writes ---------------- */

/** Save one listing, whole. The editor holds it in full, so a partial write
 *  could only lose a field. */
export async function persistProduct(p: Product): Promise<void> {
  const { id, createdAt, updatedAt, ...patch } = p
  void createdAt; void updatedAt
  useStore.getState().updateProduct(id, patch)
  if (!backendLive) return
  try {
    const saved = await api.saveProduct(p)
    /* The database stamps `updated_at`; taking it back keeps the sort order
       on the page honest. */
    useStore.getState().updateProduct(id, { updatedAt: saved.updatedAt })
  } catch (e) {
    await afterFailure(e)
  }
}

export async function removeProducts(ids: string[]): Promise<void> {
  useStore.getState().deleteProducts(ids)
  if (!backendLive) return
  try {
    await api.deleteProducts(ids)
  } catch (e) {
    await afterFailure(e)
  }
}

export async function setCatalogueStatus(ids: string[], status: ProductStatus): Promise<void> {
  useStore.getState().setProductStatus(ids, status)
  if (!backendLive) return
  try {
    await api.setProductStatus(ids, status)
  } catch (e) {
    await afterFailure(e)
  }
}

export async function duplicateListing(id: string): Promise<void> {
  const copy = useStore.getState().duplicateProduct(id)
  if (!copy || !backendLive) return
  try {
    await api.saveProduct(copy)
  } catch (e) {
    await afterFailure(e)
  }
}

/** A row that exists only in this browser, because the admin backed out of
 *  the form before it was ever saved. Nothing to tell the server about. */
export function dropUnsaved(id: string): void {
  useStore.getState().deleteProducts([id])
}
