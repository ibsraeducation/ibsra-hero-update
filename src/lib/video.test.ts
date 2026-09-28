import { describe, expect, it } from 'vitest'
import { embedUrl, formatLength, parseLength, providerOf, videoLinkProblem } from './video'

describe('embedUrl', () => {
  it('handles every YouTube link shape', () => {
    expect(embedUrl('https://youtu.be/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(embedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(embedUrl('https://youtube.com/shorts/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(embedUrl('https://youtube.com/embed/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123')
  })

  it('handles Vimeo', () => {
    expect(embedUrl('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456')
    expect(embedUrl('https://player.vimeo.com/video/123456')).toBe('https://player.vimeo.com/video/123456')
  })

  it('handles Google Drive', () => {
    expect(embedUrl('https://drive.google.com/file/d/xyz789/view')).toBe('https://drive.google.com/file/d/xyz789/preview')
    expect(embedUrl('https://drive.google.com/open?id=xyz789')).toBe('https://drive.google.com/file/d/xyz789/preview')
  })

  it('refuses anything else', () => {
    expect(embedUrl('https://example.com/video.mp4')).toBeNull()
    expect(embedUrl('not a url')).toBeNull()
  })
})

describe('providerOf', () => {
  it('reads the real provider off the link, not what the admin picked', () => {
    expect(providerOf('https://youtu.be/abc')).toBe('youtube')
    expect(providerOf('https://vimeo.com/123')).toBe('vimeo')
    expect(providerOf('https://drive.google.com/file/d/xyz/view')).toBe('drive')
    expect(providerOf('https://example.com')).toBeNull()
  })
})

describe('videoLinkProblem', () => {
  it('is empty-link when there is nothing yet', () => {
    expect(videoLinkProblem('', 'youtube')).toBe('No link yet')
  })

  it('requires https', () => {
    expect(videoLinkProblem('youtu.be/abc', 'youtube')).toBe('Must start with https://')
  })

  it('refuses a link that will not embed', () => {
    expect(videoLinkProblem('https://example.com/video.mp4', 'youtube'))
      .toBe('Not a YouTube, Vimeo or Google Drive link')
  })

  it('catches a link pasted under the wrong provider', () => {
    expect(videoLinkProblem('https://vimeo.com/123456', 'youtube'))
      .toBe('This is a Vimeo link, not YouTube')
  })

  it('is null for a good link under the right provider', () => {
    expect(videoLinkProblem('https://youtu.be/abc123', 'youtube')).toBeNull()
  })
})

describe('parseLength', () => {
  it('reads mm:ss', () => {
    expect(parseLength('12:30')).toBe(750)
    expect(parseLength('0:05')).toBe(5)
  })

  it('reads h:mm:ss', () => {
    expect(parseLength('1:02:30')).toBe(3750)
  })

  it('rejects garbage and out-of-range parts', () => {
    expect(parseLength('')).toBeNull()
    expect(parseLength('abc')).toBeNull()
    expect(parseLength('12:70')).toBeNull()
    expect(parseLength('1:2:3:4')).toBeNull()
  })
})

describe('formatLength', () => {
  it('formats seconds back to mm:ss and h:mm:ss', () => {
    expect(formatLength(750)).toBe('12:30')
    expect(formatLength(5)).toBe('0:05')
    expect(formatLength(3750)).toBe('1:02:30')
  })
})
