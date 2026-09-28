/* `embedUrl`/`isHttp` moved to `src/lib/video.ts`, which also carries the
 * link-checking and length parsing the admin side needs. Re-exported here
 * so the existing imports (VideoField, VideoEmbed, SessionView) keep working. */
export { embedUrl, isHttp } from '@/lib/video'
