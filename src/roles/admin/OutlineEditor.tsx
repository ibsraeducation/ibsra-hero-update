import { useDeferredValue, useMemo, type KeyboardEvent } from 'react'
import { Outline } from '@/components/Outline'
import { countPoints, parseOutline } from '@/lib/outline'
import { MAX_LIST_CHARS } from '@/lib/programInfo'
import './programForm.css'

const LIST_LINE = /^(\s*)([-*+]|(\d{1,3})([.)]))(\s+)(\[[ xX]\]\s+)?(.*)$/
const INDENT = '  '

/* Markdown in, bullets and sub-bullets out, side by side. Paste a whole
   outline, or type one: Enter continues a list, Enter on an empty bullet ends
   it, and Tab / Shift+Tab on list lines indents them into sub-bullets. */
export function OutlineEditor({ value, onChange, label, placeholder, fill = false }: {
  value: string; onChange: (md: string) => void; label: string; placeholder?: string
  /** Grow to the height of the pane around it, instead of a fixed 300px —
   *  what the tabbed program and course forms want. */
  fill?: boolean
}) {
  /* The preview runs a step behind the keystroke: parsing and re-rendering a
     large outline is the expensive part, and deferring it keeps typing
     instant — React commits the textarea first, the preview catches up. */
  const shownValue = useDeferredValue(value)
  const nodes = useMemo(() => parseOutline(shownValue), [shownValue])
  const example = useMemo(() => parseOutline(placeholder), [placeholder])

  // Through execCommand so the browser's undo still works; setRangeText if not.
  const replace = (el: HTMLTextAreaElement, start: number, end: number, text: string) => {
    el.setSelectionRange(start, end)
    const ok = text
      ? document.execCommand('insertText', false, text)
      : start === end || document.execCommand('delete')
    if (!ok) {
      el.setRangeText(text, start, end, 'end')
      onChange(el.value)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const el = e.currentTarget
    const { selectionStart: start, selectionEnd: end, value: v } = el
    const lineStart = v.lastIndexOf('\n', start - 1) + 1
    const lineEndAt = v.indexOf('\n', start)
    const lineEnd = lineEndAt === -1 ? v.length : lineEndAt
    const line = v.slice(lineStart, lineEnd)
    const m = LIST_LINE.exec(line)

    if (e.key === 'Enter' && !e.shiftKey && start === end && m) {
      e.preventDefault()
      const [, indent, bullet, num, sep, space] = m
      if (!m[7].trim() && start === lineEnd) {
        // An empty bullet: take the bullet away instead of starting another.
        replace(el, lineStart, lineEnd, '')
        return
      }
      const next = num ? `${Number(num) + 1}${sep}` : bullet
      replace(el, start, end, `\n${indent}${next}${space.length > 1 ? ' ' : space}`)
      return
    }

    if (e.key === 'Tab') {
      const blockEndAt = v.indexOf('\n', Math.max(end - 1, start))
      const blockEnd = blockEndAt === -1 ? v.length : blockEndAt
      const block = v.slice(lineStart, blockEnd)
      const lines = block.split('\n')
      // Tab stays keyboard navigation unless it is on a list or a selection of lines.
      if (!m && lines.length === 1) return
      e.preventDefault()
      const changed = lines.map(l => (e.shiftKey ? l.replace(/^( {1,2}|\t)/, '') : l.trim() ? INDENT + l : l))
      const out = changed.join('\n')
      if (out === block) return
      replace(el, lineStart, blockEnd, out)
      if (lines.length === 1) {
        const shift = out.length - block.length
        el.setSelectionRange(Math.max(lineStart, start + shift), Math.max(lineStart, end + shift))
      } else {
        el.setSelectionRange(lineStart, lineStart + out.length)
      }
    }
  }

  const shown = nodes.length ? nodes : example
  const used = value.length / MAX_LIST_CHARS

  return (
    <div className={`md-grid${fill ? ' fill' : ''}`}>
      <div className="stack g6">
        <textarea
          className="ta md-ta"
          value={value}
          maxLength={MAX_LIST_CHARS}
          spellCheck
          placeholder={placeholder}
          aria-label={`${label}, in Markdown`}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="hint">
          Markdown: <code>-</code> for a bullet, indent with <kbd>Tab</kbd> for a sub-bullet,
          {' '}<code>#</code> for a heading, <code>**bold**</code>. Paste a whole outline.
          {used > 0.8 && <> · {value.length.toLocaleString()} / {MAX_LIST_CHARS.toLocaleString()}</>}
        </span>
      </div>
      <div className="md-prev" aria-label={`${label}, preview`} data-example={!nodes.length}>
        <span className="md-prev-label">
          {nodes.length ? `Preview · ${countPoints(nodes)} point${countPoints(nodes) === 1 ? '' : 's'}` : 'Example'}
        </span>
        {shown.length > 0 && <Outline nodes={shown} />}
      </div>
    </div>
  )
}
