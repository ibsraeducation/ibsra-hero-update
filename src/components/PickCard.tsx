/* ==========================================================================
   The card used for a training program and for a course — in the grid, and
   as a node on the program map. One card, two layouts: the cover and the
   name open it, and the ⋯ edits or deletes it without opening it.

   Compact is the same card with less on it, not a different card: on the map
   a node has to be readable at a glance beside its connectors, so the cover
   shrinks and the blurb steps out. Nothing else changes, which is what keeps
   the map from becoming its own design.
   ========================================================================== */

import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export function PickCard({ to, onOpen, cover, eyebrow, name, blurb, facts, menu, compact, chip }: {
  /** Where it goes. A page that walks its own levels passes `onOpen` instead. */
  to?: string
  onOpen?: () => void
  cover: React.ReactNode
  /** Optional: a card on a list of one parent does not repeat its name. */
  eyebrow?: string
  name: string
  blurb?: string
  facts: string[]
  menu?: React.ReactNode
  /** Map node: smaller cover, no blurb, the first two facts only. */
  compact?: boolean
  /** A label over the name — what stage it sits on, on the map. */
  chip?: React.ReactNode
}) {
  /* "0 topics · 0 live to students · 0m" is four words that say nothing
     four times. A fact worth showing has something in it, so a zero is
     dropped rather than printed — the card gets shorter as it gets emptier,
     which is the honest way round. */
  const real = facts.filter(f => f && !/^0(\s|m\b|$)/.test(f.trim()))
  const shown = compact ? real.slice(0, 2) : real
  /* Same card either way: a link when there is somewhere to go, a button
     when the page opens the level itself. */
  const Open = ({ className, children }: { className: string; children: React.ReactNode }) =>
    to !== undefined
      ? <Link to={to} className={className} aria-label={`Open ${name}`}>{children}</Link>
      : <button type="button" className={`pick-open ${className}`} aria-label={`Open ${name}`} onClick={onOpen}>{children}</button>
  return (
    <article className="folder prod-card tree-card" data-compact={compact || undefined}>
      <Open className="prod-cover-btn">{cover}</Open>
      <span className="folder-body">
        <span className="row g8 mb8">
          <span className="grow stack g2" style={{ minWidth: 0 }}>
            <span className="row g6" style={{ minWidth: 0 }}>
              {chip}
              {eyebrow && <span className="eyebrow truncate">{eyebrow}</span>}
            </span>
            <Open className="t-md w-sb truncate">{name}</Open>
          </span>
          {menu}
          <Open className="row">
            <ChevronRight className="folder-go" />
          </Open>
        </span>

        {blurb && !compact && (
          <span className="t-xs c-muted clamp2" style={{ lineHeight: 1.6 }}>{blurb}</span>
        )}

        {shown.length > 0 && (
          <span className="row g12 wrap mt8">
            {shown.map(f => <span key={f} className="t-xs c-muted2">{f}</span>)}
          </span>
        )}
      </span>
    </article>
  )
}
