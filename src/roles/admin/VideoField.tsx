/* ==========================================================================
   One video link, on the program, course and session forms alike — the same
   "one block, three forms" rule as ValuesFields next to it.

   The source is picked first, then the link pasted, so a wrong paste is
   caught by name — "This is a YouTube link, not Google Drive" — rather than
   by a generic refusal. Two sources here, YouTube and Google Drive; Vimeo
   still plays if an old link is already stored (see `embedUrl`), it is just
   not something to reach for on a new one.

   The admin sees whether it will actually embed before they save, rather
   than finding out when a family opens the marketplace.
   ========================================================================== */

import { useState } from 'react'
import { Field, Segmented } from '@/components/ui'
import { embedUrl, isHttp, providerOf, videoLinkProblem, type VideoProvider } from '@/lib/video'
import { VideoEmbed } from '@/components/VideoEmbed'

type Source = Extract<VideoProvider, 'youtube' | 'drive'>

const PLACEHOLDER: Record<Source, string> = {
  youtube: 'https://youtu.be/…',
  drive: 'https://drive.google.com/file/d/…',
}

export function VideoField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const trimmed = value.trim()
  /* Opens on whatever the stored link actually is, so editing one does not
     silently accuse it of being the wrong kind. */
  const [source, setSource] = useState<Source>(() => {
    const p = providerOf(trimmed)
    return p === 'drive' ? 'drive' : 'youtube'
  })

  const problem = trimmed ? videoLinkProblem(trimmed, source) : null
  const ready = isHttp(trimmed) && !!embedUrl(trimmed) && !problem

  return (
    <Field label={label}>
      <div className="stack g8">
        <Segmented value={source} onChange={setSource} options={[
          { value: 'youtube', label: 'YouTube' },
          { value: 'drive', label: 'Google Drive' },
        ]} />
        <input className="inp" type="url" value={value} placeholder={PLACEHOLDER[source]}
          onChange={e => onChange(e.target.value)} />
        {trimmed && (
          <span className={`t-xs ${problem ? 'c-rose' : 'c-muted2'}`}>
            {problem ?? 'Ready to play'}
          </span>
        )}
        {ready && (
          <div style={{ maxWidth: 320 }}>
            <VideoEmbed url={trimmed} title={label} />
          </div>
        )}
      </div>
    </Field>
  )
}
