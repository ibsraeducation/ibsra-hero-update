/* ==========================================================================
   Turning backend errors into sentences a person can act on, and telling a
   temporary failure (try again) from a refusal (stop and reload).
   ========================================================================== */

interface ErrLike { code?: string; message?: string; status?: number; name?: string }

const asErr = (e: unknown): ErrLike =>
  (e && typeof e === 'object' ? e : { message: String(e) }) as ErrLike

/** A token used a moment after it was issued, on a server whose clock runs a
 *  little behind the auth server's. It goes away within seconds. */
export function isClockSkew(e: unknown): boolean {
  const err = asErr(e)
  return err.code === 'PGRST303' || /issued at future/i.test(err.message ?? '')
}

/** Run a request again while it only fails on clock skew (about 7 s at most). */
export async function retryClockSkew<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (!isClockSkew(e) || attempt >= 5) throw e
      await new Promise(r => setTimeout(r, 700 * attempt))
    }
  }
}

/** A network drop, a timeout or a 5xx — worth retrying as-is. */
export function isTransient(e: unknown): boolean {
  const err = asErr(e)
  const code = err.code ?? ''
  const msg = err.message ?? ''
  if (isClockSkew(e)) return true
  if (/failed to fetch|failed to send|networkerror|network request failed|load failed|timeout|aborted/i.test(msg)) return true
  if (typeof err.status === 'number' && (err.status === 0 || err.status >= 500)) return true
  // connection / resource classes in Postgres
  return /^(08|53|57)/.test(code)
}

export function toMessage(e: unknown): string {
  const err = asErr(e)
  const code = err.code ?? ''
  const msg = err.message ?? ''
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) return "You don't have permission to do that."
  if (code === 'PT409' || /session_conflict/.test(msg)) return 'This session was changed somewhere else (another tab?). The latest copy was reloaded.'
  if (code === '23503') return 'It still has students or answers attached — archive it instead of deleting.'
  if (code === '23505') return 'That already exists.'
  if (code === '23514') return 'One of the values is not allowed (check dates and lengths).'
  if (code === '22023' || code === 'P0002') return msg || 'That request was not valid.'
  if (isClockSkew(e)) return 'The server needed a moment after signing in. Try again.'
  if (isTransient(e)) return "Can't reach the server. Check the connection and try again."
  return msg || 'Something went wrong.'
}
