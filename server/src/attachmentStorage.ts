import path from 'node:path'

// BR-13: sanitize the filename before it ever touches the filesystem.
// `path.basename` strips any directory component (so `../../etc/passwd` or
// `..\\..\\config` collapse to just `passwd`/`config`), and the timestamp
// prefix avoids collisions between uploads with the same original name.
export function sanitizeFilename(originalName: string): string {
  const base = path.basename(originalName)
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file'
  return `${Date.now()}-${safe}`
}

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_ACTIVE_ATTACHMENTS_PER_TICKET = 5
