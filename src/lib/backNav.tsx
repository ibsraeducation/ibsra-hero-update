/* ==========================================================================
   Back that means back.

   Every "Back to …" button and breadcrumb in the app is a link to the page
   above. Followed as a plain link it pushes a new history entry, so the
   browser's own Back button then returns to the page just left — the
   session you backed out of, the program you closed — which reads as the
   app jumping to a different page.

   So the app keeps a trail of what each history entry holds (by the index
   React Router stamps on `history.state`), and an up-link whose target is
   where the user walked down from — right behind, or further back with
   only deeper pages in between — steps back instead of pushing. When it is
   not — a deep link, a page reached from a notification — it is an
   ordinary link.

   The trail lives in sessionStorage: it belongs to this tab and survives a
   reload, like the history it mirrors.
   ========================================================================== */

import { forwardRef, useCallback, useEffect, useRef, type MouseEvent } from 'react'
import {
  Link, useLocation, useNavigate, useNavigationType, type LinkProps, type NavigateOptions,
} from 'react-router-dom'

const KEY = 'ibsra.trail.v1'

function read(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

function write(t: string[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(t)) } catch { /* private mode: in memory only */ }
}

let trail: string[] = read()

/** Where this entry sits in the tab's history — set by BrowserRouter. */
const index = (): number => {
  const i = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof i === 'number' ? i : 0
}

const norm = (to: string) => {
  const [path, search = ''] = to.split('?')
  const p = path.replace(/\/+$/, '') || '/'
  return search ? `${p}?${search}` : p
}

/** What the entry right behind this one holds, if the app knows it. */
function previous(): string | null {
  const i = index()
  return i > 0 && trail[i - 1] != null ? trail[i - 1] : null
}

const pathOf = (entry: string) => entry.split('?')[0]
const inside = (entry: string, base: string) => {
  const b = pathOf(base)
  return pathOf(entry).startsWith(b === '/' ? '/' : b + '/')
}

/** How many entries back `to` is, when the user walked down from it to here
 *  — every entry in between deeper inside it (session → course → program).
 *  Null when it is not behind us that way, and a plain link is right. */
function stepsBackTo(to: string): number | null {
  const target = norm(to)
  const i = index()
  for (let j = i - 1; j >= 0; j--) {
    const e = trail[j]
    if (e == null) return null
    if (e === target) return i - j
    if (!inside(e, target)) return null
  }
  return null
}

/** Mount once, inside the router: records what every history entry holds. */
export function useHistoryTrail() {
  const loc = useLocation()
  const type = useNavigationType()
  const first = useRef(true)
  useEffect(() => {
    const i = index()
    /* A push drops the forward entries, as the browser does. So does the
       first render: whatever was recorded past this entry belongs to a
       history this document can no longer see. */
    if (type === 'PUSH' || first.current) trail = trail.slice(0, i)
    first.current = false
    trail[i] = norm(loc.pathname + loc.search)
    write(trail)
  }, [loc.key, loc.pathname, loc.search, type])
}

/** Navigate up to `to`: a step back when that is where the user came from,
 *  a plain navigation otherwise. Already there, it does nothing — no
 *  duplicate entry for Back to walk through. */
export function useGoBack() {
  const navigate = useNavigate()
  const loc = useLocation()
  return useCallback((to: string, opts?: NavigateOptions) => {
    if (norm(loc.pathname + loc.search) === norm(to)) return
    const back = stepsBackTo(to)
    if (back) navigate(-back)
    else navigate(to, opts)
  }, [navigate, loc.pathname, loc.search])
}

/** Back to wherever the user was, or `fallback` when this is the first page
 *  the app opened in this tab. */
export function useGoBackOr() {
  const navigate = useNavigate()
  return useCallback((fallback: string) => {
    if (previous() != null) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate])
}

/** A link to the page above — a breadcrumb, a "Back to …" button. */
export const BackLink = forwardRef<HTMLAnchorElement, LinkProps & { to: string }>(
  function BackLink({ to, onClick, ...rest }, ref) {
    const navigate = useNavigate()
    const click = (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e)
      if (e.defaultPrevented) return
      /* A new tab or window is the browser's business. */
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const back = stepsBackTo(to)
      if (back) {
        e.preventDefault()
        navigate(-back)
      }
    }
    return <Link ref={ref} to={to} onClick={click} {...rest} />
  },
)
