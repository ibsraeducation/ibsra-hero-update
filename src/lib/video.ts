/* ==========================================================================
   Video by link — the whole story for this build. No upload pipeline, so a
   recording is one of three services: a YouTube video (meant to be
   unlisted), a Vimeo video, or a file shared from Google Drive.

   `embedUrl` turns a link into the address that actually plays; the admin
   sees whether it works before they save it, and `readiness()` in
   `src/lib/store.ts` refuses to publish a topic whose link does not.
   ========================================================================== */

export type VideoProvider = 'youtube' | 'vimeo' | 'drive'

/** A recording link turned into something the session view can embed, or
 *  null when it is not a link this build can play. */
export function embedUrl(url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.replace(/^www\.|^m\./, '')

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v')
    if (v) return `https://www.youtube-nocookie.com/embed/${v}`
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/)
    return m ? `https://player.vimeo.com/video/${m[1]}` : null
  }
  if (host === 'player.vimeo.com') return url
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/)
    const id = m?.[1] ?? u.searchParams.get('id')
    return id ? `https://drive.google.com/file/d/${id}/preview` : null
  }
  return null
}

export const isHttp = (url: string | undefined | null) => !!url && /^https?:\/\//i.test(url)

/** Which of the three services a link actually belongs to, independent of
 *  what the admin picked in the provider select. Null when it embeds in
 *  none of them. */
export function providerOf(url: string): VideoProvider | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') return 'youtube'
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return 'vimeo'
  if (host === 'drive.google.com') return 'drive'
  return null
}

/** What is wrong with a video link, in the admin's own words — or null when
 *  it is fine. Checked at attach time and again by `readiness()`, so a
 *  session can never publish with a link that will not play. */
export function videoLinkProblem(url: string, provider: VideoProvider): string | null {
  const trimmed = url.trim()
  if (!trimmed) return 'No link yet'
  if (!isHttp(trimmed)) return 'Must start with https://'
  if (!embedUrl(trimmed)) return 'Not a YouTube, Vimeo or Google Drive link'
  const actual = providerOf(trimmed)
  if (actual && actual !== provider) {
    return `This is a ${PROVIDER_LABEL[actual]} link, not ${PROVIDER_LABEL[provider]}`
  }
  return null
}

export const PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: 'YouTube', vimeo: 'Vimeo', drive: 'Google Drive',
}

/** "12:30" or "1:02:30" → seconds. Null for anything that is not a plain
 *  length — no negative parts, no minutes or seconds over 59. */
export function parseLength(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every(p => /^\d{1,2}$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.length === 2) {
    const [m, s] = nums
    if (s > 59) return null
    return m * 60 + s
  }
  const [h, m, s] = nums
  if (m > 59 || s > 59) return null
  return h * 3600 + m * 60 + s
}

/** seconds → "12:30" / "1:02:30", for showing back a length that was typed
 *  or already on the row. */
export function formatLength(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(sec).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}
