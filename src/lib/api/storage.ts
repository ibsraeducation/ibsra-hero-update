/* ==========================================================================
   Files. Both buckets are private: a stored file is referenced as
   `storage://<bucket>/<path>` and opened through a signed URL that lives for
   ten minutes — storage checks the reader's access before signing it.
   ========================================================================== */

import { sb } from '@/lib/supabase'
import type { MaterialKind } from '@/lib/types'

const SCHEME = 'storage://'
type Bucket = 'materials' | 'submissions'

export const isStored = (url: string | null | undefined) => !!url && url.startsWith(SCHEME)

export function parseStored(url: string): { bucket: Bucket; path: string } | null {
  if (!isStored(url)) return null
  const rest = url.slice(SCHEME.length)
  const slash = rest.indexOf('/')
  if (slash < 1) return null
  return { bucket: rest.slice(0, slash) as Bucket, path: rest.slice(slash + 1) }
}

const safeName = (name: string) =>
  name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(-100) || 'file'

const EXT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  json: 'application/json',
  ipynb: 'application/json',
  zip: 'application/zip',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  txt: 'text/plain', md: 'text/markdown', html: 'text/html', css: 'text/css',
  js: 'text/javascript', ts: 'text/plain', py: 'text/x-python', sql: 'text/plain',
}

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

function contentType(file: File) {
  return file.type || EXT_TYPES[ext(file.name)] || 'application/octet-stream'
}

export function kindFromFile(file: File): MaterialKind {
  const e = ext(file.name)
  const t = contentType(file)
  if (e === 'pdf') return 'pdf'
  if (['ppt', 'pptx', 'key', 'odp'].includes(e)) return 'slides'
  if (['xls', 'xlsx', 'ods'].includes(e)) return 'sheet'
  if (['csv', 'json', 'parquet'].includes(e)) return 'dataset'
  if (t.startsWith('image/')) return 'image'
  return 'code'
}

function uploadError(err: { message?: string; statusCode?: string }) {
  const msg = err.message ?? ''
  if (/mime|type/i.test(msg)) return new Error('This file type is not allowed. Use PDF, Office, images, ZIP or text.')
  if (/size|too large|exceeded/i.test(msg)) return new Error('The file is too large.')
  return err
}

export interface Uploaded { url: string; size: number; name: string; kind: MaterialKind }

/** A teaching file for a session (admin only). */
export async function uploadMaterial(sessionId: string, file: File): Promise<Uploaded> {
  const path = `${sessionId}/${crypto.randomUUID()}/${safeName(file.name)}`
  const { error } = await sb().storage.from('materials').upload(path, file, {
    contentType: contentType(file), upsert: false,
  })
  if (error) throw uploadError(error)
  return { url: `${SCHEME}materials/${path}`, size: file.size, name: file.name, kind: kindFromFile(file) }
}

/** A student's answer file. The first folder must be their own user id. */
export async function uploadSubmission(studentId: string, sessionId: string, taskId: string, file: File) {
  const path = `${studentId}/${sessionId}/${taskId}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await sb().storage.from('submissions').upload(path, file, {
    contentType: contentType(file), upsert: false,
  })
  if (error) throw uploadError(error)
  return path
}

export async function signedUrl(bucket: Bucket, path: string, seconds = 600): Promise<string> {
  const { data, error } = await sb().storage.from(bucket).createSignedUrl(path, seconds)
  if (error || !data) throw error ?? new Error('Could not open the file')
  return data.signedUrl
}

/** Open a material or answer in a new tab. The tab is opened straight away,
 *  inside the click, so a popup blocker lets it through while the link is
 *  being signed. */
export async function openFile(urlOrPath: string, bucket?: Bucket): Promise<void> {
  const tab = window.open('about:blank', '_blank')
  try {
    let href = urlOrPath
    const stored = parseStored(urlOrPath)
    if (stored) href = await signedUrl(stored.bucket, stored.path)
    else if (bucket) href = await signedUrl(bucket, urlOrPath)
    if (tab) tab.location.href = href
    else window.location.assign(href)
  } catch (e) {
    tab?.close()
    throw e
  }
}
