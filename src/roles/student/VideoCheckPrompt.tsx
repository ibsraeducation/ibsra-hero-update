import { useState } from 'react'
import { Check, Clock, ImagePlus, Loader2, Wrench } from 'lucide-react'
import { Modal } from '@/components/ui'
import { duration, bytes } from '@/lib/format'
import { useStore } from '@/lib/store'
import { backendLive } from '@/lib/supabase'
import { useAuthStore } from '@/lib/authStore'
import { submitAnswer } from '@/lib/api/submissions'
import { uploadSubmission } from '@/lib/api/storage'
import { toMessage } from '@/lib/api/errors'
import type { VideoCheck } from '@/lib/types'
import { IMAGE_ACCEPT, pickFile } from '@/roles/admin/editor/uploads'

/* The checkpoint, as the student meets it: the recording is paused behind
   this and does not go on until the question is answered. A checkpoint the
   mentor marked skippable can be waved past; a required one cannot. */

export function VideoCheckPrompt({ check, sessionId, onDone, onSkip }: {
  check: VideoCheck
  sessionId: string
  onDone: () => void
  onSkip: () => void
}) {
  const toast = useStore(s => s.toast)
  const studentId = useAuthStore(s => s.profile?.id)
  const [choice, setChoice] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const isMcq = check.kind === 'mcq'
  const wantsImage = !isMcq && !!check.wantsImage
  const canAnswer = isMcq
    ? !!choice
    : text.trim().length > 0 && (!wantsImage || !!file)

  const answer = async () => {
    if (!backendLive || !studentId) {
      if (isMcq) {
        const picked = check.options.find(o => o.id === choice)
        toast(picked?.correct
          ? 'Correct — back to the recording'
          : 'Not quite. Watch that part again before you carry on.',
          picked?.correct ? 'ok' : 'info')
      } else {
        toast('Noted — your mentor sees it with the rest of this topic')
      }
      onDone()
      return
    }

    if (busy) return
    setBusy(true)
    try {
      const filePath = file
        ? await uploadSubmission(studentId, sessionId, check.id, file)
        : undefined
      const r = await submitAnswer(sessionId, check.id, {
        choiceIds: isMcq ? [choice] : undefined,
        text: isMcq ? undefined : text,
        filePath,
      })
      if (r.already) toast('You already answered this one', 'info')
      else if (isMcq) {
        toast(r.is_correct ? `Correct · ${r.score}/${r.points}` : `Not quite · 0/${r.points}`,
          r.is_correct ? 'ok' : 'info')
      } else {
        toast('Sent to your mentor with the rest of this topic')
      }
      onDone()
    } catch (e) {
      toast(toMessage(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      /* A required checkpoint has nowhere to close to — say why rather than
         leaving the corner cross doing nothing. */
      onClose={check.required
        ? () => toast('Answer this to carry on with the recording', 'info')
        : onSkip}
      title={isMcq ? 'Question at this point' : 'Task at this point'}
      description={`The recording is paused at ${duration(check.atSec)}.`}
      footer={
        <>
          {!check.required && (
            <button className="btn" onClick={onSkip}>Skip and carry on</button>
          )}
          <button className="btn primary auto-s" disabled={!canAnswer || busy}
            onClick={() => void answer()}>
            {busy ? <Loader2 className="spin" /> : <Check />}Answer and carry on
          </button>
        </>
      }
    >
      <div className="stack g14">
        <span className="row g6 t-xs c-muted2">
          {isMcq ? <Clock style={{ width: 12, height: 12 }} /> : <Wrench style={{ width: 12, height: 12 }} />}
          {isMcq ? 'Pick one' : 'Do it, then write what happened'}
          {check.required ? ' · must be answered' : ' · can be skipped'}
        </span>

        {check.image && (
          <img src={check.image} alt="" style={{
            width: '100%', maxHeight: 260, objectFit: 'contain',
            borderRadius: 'var(--r-md)', border: '1px solid var(--line)',
            background: 'var(--surface-2)',
          }} />
        )}

        <span className="t-md w-med">{check.question || 'Untitled question'}</span>

        {isMcq ? (
          <div className="stack g6">
            {check.options.map(o => (
              <button key={o.id} type="button" className="opt-pick"
                data-on={choice === o.id} onClick={() => setChoice(o.id)}>
                <span className="tick">{choice === o.id && <Check />}</span>
                <span className="t-sm">{o.text}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="stack g8">
            <textarea className="ta" value={text} onChange={e => setText(e.target.value)}
              placeholder="What did you do, and what happened?" />
            {wantsImage && (
              <div className="dropzone"
                onClick={() => void pickFile(IMAGE_ACCEPT).then(f => f && setFile(f))}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}>
                <ImagePlus style={{ width: 20, height: 20 }} />
                <span className="t-sm">{file ? file.name : 'Add a picture of your work'}</span>
                <span className="t-xs c-muted2">
                  {file ? `${bytes(file.size)} · ready to send` : 'A photo or a screenshot'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
