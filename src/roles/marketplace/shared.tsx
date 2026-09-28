/* ==========================================================================
   Pieces shared by every marketplace surface — admin, student and parent.

   The cover art lives here rather than in each page because a listing has to
   look the same everywhere it appears: the admin is looking at exactly what
   the family will see, not an approximation of it.
   ========================================================================== */

import type { ReactNode } from 'react'
import {
  GraduationCap, Package,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { money } from '@/lib/format'
import { PRODUCT_CATEGORY_META, type Product, type ProductCategory } from '@/lib/types'

export const CATEGORY_ICON: Record<ProductCategory, LucideIcon> = {
  program: GraduationCap,
  kit: Package,
}

/** An undecided price is never rendered as free — that is the whole reason
 *  `price` is nullable rather than defaulting to 0. */
export function priceLabel(p: Product): string {
  if (p.price === null) return 'Price on request'
  if (p.price === 0) return 'Free'
  return money(p.price)
}

/** The ways a price can be paid, one sentence each, worked out from what the
 *  admin entered. Empty when there is no choice to make — no price, a free
 *  one, or a single payment with nothing off. */
export function paymentLines(p: Product): string[] {
  if (p.price === null || p.price <= 0) return []
  const out: string[] = []
  const off = p.upfrontDiscount ?? 0
  const n = p.installments ?? 1
  const dep = Math.min(p.deposit ?? 0, p.price)
  if (off > 0) {
    out.push(`${money(Math.round(p.price * (1 - off / 100)))} if paid in full up front — ${off}% off`)
  }
  if (n > 1) {
    out.push(`${dep ? `${money(dep)} deposit, then ` : ''}${n} payments of ${money(Math.ceil((p.price - dep) / n))}`)
  } else if (dep > 0) {
    out.push(`${money(dep)} deposit holds a seat, the rest before it starts`)
  }
  if (p.category === 'program' && p.pricePerCourse) {
    out.push(`Or ${money(p.pricePerCourse)} per course, paid as each course starts`)
  }
  return out
}

/* ---------------- cover art ---------------- */

/** Stable small integer from an id, so a listing keeps the same cover across
 *  reloads without storing one. */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

const isGradient = (v: string) => /^(linear|radial|conic)-gradient\(/.test(v)

/** The cover a listing falls back to when no image has been set: its own
 *  colour, at an angle fixed by its id. Mixed toward `--surface` rather than
 *  white so the pale end stays pale in light mode and deep in dark mode. */
export function coverFor(p: Product): string {
  const set = p.thumbnail?.trim()
  if (set && isGradient(set)) return set
  const c = p.color || 'brand'
  /* 112–164°: keeps the darkest stop in the top-start corner, which is where
     the category chip sits, so the chip is always on the dark end. */
  const angle = 112 + (hash(p.id) % 53)
  return `linear-gradient(${angle}deg, var(--${c}-600, var(--brand-600)) 0%, `
    + `var(--${c}-500, var(--brand-500)) 52%, `
    + `color-mix(in srgb, var(--${c}-500, var(--brand-500)) 55%, var(--surface)) 100%)`
}

/** True when the listing carries a real image rather than a gradient. */
export const coverImage = (p: Product): string | null => {
  const set = p.thumbnail?.trim()
  return set && !isGradient(set) ? set : null
}

/**
 * The card cover: the gradient (or the image over it), the category icon as a
 * watermark, and the category name. `tail` takes a price or a status badge.
 */
export function Thumb({ p, height = 116, tail, className = '' }: {
  p: Product
  height?: number
  tail?: ReactNode
  className?: string
}) {
  const Icon = CATEGORY_ICON[p.category]
  const img = coverImage(p)

  return (
    <span className={`prod-thumb ${className}`} style={{ height, background: coverFor(p) }}>
      {img && (
        /* Decorative: the name is right underneath it in text, so alt="" keeps
           a screen reader from reading the listing twice. A broken URL just
           uncovers the gradient behind it. */
        <img
          src={img} alt="" loading="lazy"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <Icon className="prod-thumb-mark" aria-hidden />
      <span className="prod-thumb-tag">{PRODUCT_CATEGORY_META[p.category].one}</span>
      {tail && <span className="prod-thumb-tail">{tail}</span>}
    </span>
  )
}
