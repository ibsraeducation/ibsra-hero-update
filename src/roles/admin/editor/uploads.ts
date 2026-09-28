/* Real file picking for the editor, when the backend is live. */

/** What the materials bucket accepts, as a hint to the file picker. */
export const MATERIAL_ACCEPT = [
  '.pdf', '.ppt', '.pptx', '.xls', '.xlsx', '.doc', '.docx', '.csv', '.json', '.ipynb',
  '.zip', '.txt', '.md', '.py', '.js', '.ts', '.html', '.css', '.sql', 'image/*',
].join(',')

/** A card picture. Images only — it is shown, never downloaded. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif'

/** A picture the browser can keep on its own: scaled down to `max` on its
 *  long side and re-encoded, so a 4 MB photo becomes a ~150 KB card cover
 *  that fits in the saved database without a backend behind it. */
export function readImageAsDataUrl(file: File, max = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('This browser cannot resize the picture.')); return }
      ctx.drawImage(img, 0, 0, w, h)
      /* A transparent PNG stays a PNG; everything else is cheaper as JPEG. */
      const keepAlpha = file.type === 'image/png' || file.type === 'image/webp'
      resolve(canvas.toDataURL(keepAlpha ? 'image/webp' : 'image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture.')) }
    img.src = url
  })
}

/** Open the system file picker and resolve with the chosen file, or null. */
export function pickFile(accept?: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}
