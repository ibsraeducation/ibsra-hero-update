/* Small, allocation-light formatters. Intl objects are created once. */

const egp = new Intl.NumberFormat('en-EG', {
  style: 'currency', currency: 'EGP', maximumFractionDigits: 0,
})
const num = new Intl.NumberFormat('en-US')
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const dateFullFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

export const money = (n: number) => egp.format(n).replace('EGP', 'EGP ').replace(/\s+/g, ' ').trim()
export const moneyShort = (n: number) =>
  n >= 1_000_000 ? `EGP ${(n / 1_000_000).toFixed(1)}m`
  : n >= 10_000 ? `EGP ${Math.round(n / 1000)}k`
  : `EGP ${num.format(n)}`
export const count = (n: number) => num.format(n)
export const pct = (n: number, d = 0) => `${n.toFixed(d)}%`

export const date = (v: string | null | undefined) => (v ? dateFmt.format(new Date(v)) : '—')
export const dateFull = (v: string | null | undefined) => (v ? dateFullFmt.format(new Date(v)) : '—')
export const time = (v: string | null | undefined) => (v ? timeFmt.format(new Date(v)) : '—')
export const dateTime = (v: string | null | undefined) => (v ? `${date(v)} · ${time(v)}` : '—')

/** For <input type="datetime-local"> round-tripping. */
export const toLocalInput = (v: string | null | undefined) => {
  if (!v) return ''
  const d = new Date(v)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

export function relative(v: string | null | undefined): string {
  if (!v) return '—'
  const diff = Date.now() - new Date(v).getTime()
  const abs = Math.abs(diff)
  const fut = diff < 0
  const m = Math.round(abs / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return fut ? `in ${m}m` : `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return fut ? `in ${h}h` : `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return fut ? `in ${d}d` : `${d}d ago`
  const mo = Math.round(d / 30)
  return fut ? `in ${mo}mo` : `${mo}mo ago`
}

export function duration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function mins(m: number): string {
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

export function bytes(b: number): string {
  if (!b) return '—'
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export const initials = (name: string) =>
  name.split(/[\s(]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

/** Cheap fuzzy-ish subsequence match, good enough for a local command palette. */
export function fuzzy(needle: string, hay: string): boolean {
  if (!needle) return true
  const n = needle.toLowerCase()
  const h = hay.toLowerCase()
  if (h.includes(n)) return true
  let i = 0
  for (const ch of h) { if (ch === n[i]) i++; if (i === n.length) return true }
  return false
}

/** Median that ignores nothing — the business model insists on median, not mean. */
export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** The number a family reaches a person on when the platform has nothing
 *  for them — no time that fits, or none in their part of the world. The
 *  admin's own number in Payment settings replaces it the moment one is
 *  saved; this is what answers before then. */
export const SUPPORT_WHATSAPP = '+201009937773'

export function whatsappLink(number: string | null | undefined, text: string): string | null {
  const digits = (number ?? '').replace(/\D/g, '').replace(/^00/, '')
  if (digits.length < 8) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
