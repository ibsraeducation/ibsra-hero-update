/* ==========================================================================
   One video link, played. Used everywhere a family watches the video the
   admin attached to a program, a course or a session — the marketplace board,
   the program page, the course and session outlines — and nowhere else: a
   topic's own teaching recording has its own richer player in SessionView,
   with checkpoints and progress. This is just the link, embedded when the
   host allows it, and one click away in its own tab when it does not.

   Same iframe attributes as SessionView's recording player, so a link that
   plays there plays the same way here.
   ========================================================================== */

import { ExternalLink, Video as VideoIcon } from 'lucide-react'
import { embedUrl, isHttp } from '@/roles/student/media'

export function VideoEmbed({ url, title }: { url?: string | null; title: string }) {
  if (!isHttp(url)) return null
  const embed = embedUrl(url!)

  return (
    <div className="stack g6">
      <div className="video-frame">
        {embed ? (
          <iframe
            src={embed}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <div className="stack g8" style={{ alignItems: 'center', position: 'relative', color: '#fff' }}>
            <VideoIcon style={{ width: 22, height: 22, opacity: 0.8 }} />
            <span className="t-sm">This video opens in a new tab</span>
          </div>
        )}
      </div>
      {!embed && (
        <a className="btn sm" href={url!} target="_blank" rel="noreferrer">
          <ExternalLink />Watch in a new tab
        </a>
      )}
    </div>
  )
}
