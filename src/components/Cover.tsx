/* ==========================================================================
   Card cover for the content tree — program, course, session — on both the
   admin Material pages and the student's Missions.

   Same chrome as the marketplace thumbnail (.prod-thumb), so a card with a
   picture on top reads as one kind of thing across the whole product. Only
   the source differs: a session shows the picture it was given, then its
   first recording's frame, and anything without either falls back to its
   program's colour.
   ========================================================================== */

import { useEffect, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Session } from '@/lib/types'
import { isStored, parseStored, signedUrl } from '@/lib/api/storage'

/** Stable small integer from an id, so a card keeps its angle across reloads. */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

const isGradient = (v: string) => /^(linear|radial|conic)-gradient\(/.test(v)

/** A picture rather than a colour — an uploaded file or a pasted link. */
export const isPicture = (v: string | undefined | null): v is string =>
  !!v && !isGradient(v) && (isStored(v) || /^(https?:|data:|blob:|\/)/.test(v.trim()))

/** A gradient mixed from a colour token, at an angle fixed by the id. The pale
 *  end mixes toward `--surface`, so it stays right in both themes. */
export function toneCover(tone: string, id: string): string {
  const c = tone || 'brand'
  const angle = 112 + (hash(id) % 53)
  return `linear-gradient(${angle}deg, var(--${c}-600, var(--brand-600)) 0%, `
    + `var(--${c}-500, var(--brand-500)) 52%, `
    + `color-mix(in srgb, var(--${c}-500, var(--brand-500)) 55%, var(--surface)) 100%)`
}

/** A session's cover: the picture it was given, else the frame of its first
 *  recording, else its tone. */
export function sessionCover(s: Session, tone: string): string {
  if (isPicture(s.cover)) return s.cover.trim()
  const frame = s.titles.find(t => t.video?.thumbnail)?.video?.thumbnail?.trim()
  return frame && isGradient(frame) ? frame : toneCover(tone, s.id)
}

/** An uploaded picture lives in a private bucket, so it is shown through a
 *  signed link. A plain URL is used as it stands. */
export function usePictureSrc(src: string | undefined): string {
  const stored = isStored(src) ? src! : ''
  const [signed, setSigned] = useState('')

  useEffect(() => {
    if (!stored) { setSigned(''); return }
    let live = true
    const at = parseStored(stored)
    if (!at) return
    signedUrl(at.bucket, at.path, 3600)
      .then(u => { if (live) setSigned(u) })
      .catch(() => { if (live) setSigned('') })
    return () => { live = false }
  }, [stored])

  if (!src) return ''
  return stored ? signed : src
}

export function Cover({ bg, icon: Icon, tag, tail, big, caption, height = 112, dim }: {
  /** A CSS gradient from toneCover() / sessionCover(), or a picture's URL. */
  bg: string
  icon: LucideIcon
  /** The chip in the top-start corner — what kind of card this is. */
  tag: string
  /** Top-end corner, usually a status badge. */
  tail?: ReactNode
  /** A large label over the art — a course or session number. */
  big?: string
  /** The card's name, read over the art beside the number. */
  caption?: ReactNode
  height?: number
  /** Locked or unpublished — the art steps back so the state reads first. */
  dim?: boolean
}) {
  const picture = isPicture(bg)
  const src = usePictureSrc(picture ? bg : undefined)
  /* A picture needs its own scrim: the number, the name and the status chip
     all sit on top of it and have to stay readable whatever it shows. */
  return (
    <span
      className="prod-thumb cover"
      data-dim={dim || undefined}
      data-picture={picture || undefined}
      style={{ height, background: picture ? 'var(--surface-3)' : bg }}
    >
      {picture && src && <img src={src} alt="" loading="lazy" />}
      {!picture && <Icon className="prod-thumb-mark" aria-hidden />}
      {picture && <span className="cover-scrim" aria-hidden />}
      {(big || caption) && (
        <span className="cover-label">
          {big && <span className="cover-big tnum" aria-hidden>{big}</span>}
          {caption && <span className="cover-name truncate">{caption}</span>}
        </span>
      )}
      <span className="prod-thumb-tag">{tag}</span>
      {tail && <span className="prod-thumb-tail">{tail}</span>}
    </span>
  )
}
