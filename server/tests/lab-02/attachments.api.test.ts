import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client'
import app from '../../src/app'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const createdTicketIds: number[] = []
let requesterId: number
let ticketId: number
// The cap test deliberately fills this ticket to its 5-active limit, so the
// soft-remove lifecycle tests get their own separate ticket — otherwise
// they'd hit the same cap and every upload after the cap test would 400.
let softRemoveTicketId: number

async function newFixtureTicket() {
  const category = await prisma.category.findFirstOrThrow()
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow()
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: 'Fixture ticket for attachments.api.test.ts',
      description: 'Created only to exercise attachment endpoints.',
      requestedPriority: 'LOW',
    },
  })
  createdTicketIds.push(ticket.id)
  return ticket.id
}

beforeAll(async () => {
  const [requester] = await prisma.devRequester.findMany({ where: { isActive: true }, take: 1 })
  requesterId = requester.id
  ticketId = await newFixtureTicket()
  softRemoveTicketId = await newFixtureTicket()
})

afterAll(async () => {
  // Clean up any files multer wrote to disk for these tickets' fixture data.
  for (const id of createdTicketIds) {
    fs.rmSync(path.join(process.cwd(), 'uploads', String(id)), { recursive: true, force: true })
  }

  if (createdTicketIds.length > 0) {
    // Attachment.ticketId is a RESTRICT foreign key — delete attachments
    // before their parent tickets, or the ticket delete fails.
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } })
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } })
  }
  await prisma.$disconnect()
})

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

// API-05 (BR-12): a valid, small JPEG uploads successfully.
describe('POST /api/tickets/:id/attachments — valid upload', () => {
  it('returns 201 with attachment metadata', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId })
      .attach('file', JPEG_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(201)
    expect(res.body.filename).toBe('photo.jpg')
    expect(res.body.mimeType).toBe('image/jpeg')
    expect(res.body.isRemoved).toBe(false)
    expect(res.body).not.toHaveProperty('storagePath') // BR-13: never expose the raw path
  })
})

// API-06 (AC-05, BR-12): an oversized file is rejected; a following valid
// upload for the same ticket still succeeds independently.
describe('POST /api/tickets/:id/attachments — oversized file', () => {
  it('rejects a file over 5 MB', async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId })
      .attach('file', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(400)
  })

  it('still accepts a valid file afterward', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId })
      .attach('file', JPEG_BYTES, { filename: 'photo-after-reject.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(201)
  })
})

describe('POST /api/tickets/:id/attachments — unsupported file type', () => {
  it('rejects an .exe-style mime type', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId })
      .attach('file', Buffer.from('not really an exe'), {
        filename: 'tool.exe',
        contentType: 'application/x-msdownload',
      })

    expect(res.status).toBe(400)
  })
})

// API-07 (AC-06, BR-12): the 6th active attachment on one ticket is rejected.
describe('POST /api/tickets/:id/attachments — active-attachment cap', () => {
  it('rejects the 6th active attachment', async () => {
    // Fixture ticket already has 2 attachments from the tests above; add
    // enough more to reach exactly 5 active, then try a 6th.
    const existing = await prisma.attachment.count({ where: { ticketId, isRemoved: false } })
    for (let i = existing; i < 5; i++) {
      const res = await request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .query({ requesterId })
        .attach('file', JPEG_BYTES, { filename: `fill-${i}.jpg`, contentType: 'image/jpeg' })
      expect(res.status).toBe(201)
    }

    const sixth = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .query({ requesterId })
      .attach('file', JPEG_BYTES, { filename: 'sixth.jpg', contentType: 'image/jpeg' })

    expect(sixth.status).toBe(400)
  })
})

// API-08 (AC-11, BR-15) + API-09 (BR-14): soft-remove blocks download but
// keeps the row (and the file) — never a hard delete.
describe('soft-remove lifecycle', () => {
  it('removes an attachment, keeps its row, and blocks its download', async () => {
    const uploadRes = await request(app)
      .post(`/api/tickets/${softRemoveTicketId}/attachments`)
      .query({ requesterId })
      .attach('file', JPEG_BYTES, { filename: 'to-be-removed.jpg', contentType: 'image/jpeg' })
    expect(uploadRes.status).toBe(201)
    const attachmentId = uploadRes.body.id

    const beforeRow = await prisma.attachment.findUnique({ where: { id: attachmentId } })
    expect(beforeRow).not.toBeNull()
    expect(fs.existsSync(beforeRow!.storagePath)).toBe(true)

    const removeRes = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .send({ requesterId, reason: 'Uploaded the wrong file' })
    expect(removeRes.status).toBe(200)
    expect(removeRes.body.isRemoved).toBe(true)

    // BR-14: the row and the file on disk both still exist.
    const afterRow = await prisma.attachment.findUnique({ where: { id: attachmentId } })
    expect(afterRow).not.toBeNull()
    expect(afterRow!.isRemoved).toBe(true)
    expect(fs.existsSync(afterRow!.storagePath)).toBe(true)

    // BR-15: metadata is still visible...
    const metadataRes = await request(app)
      .get(`/api/attachments/${attachmentId}`)
      .query({ requesterId })
    expect(metadataRes.status).toBe(200)
    expect(metadataRes.body.isRemoved).toBe(true)

    // ...but download is blocked.
    const downloadRes = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .query({ requesterId })
    expect(downloadRes.status).toBe(404)
  })

  it('returns 409 when removing an already-removed attachment again', async () => {
    const uploadRes = await request(app)
      .post(`/api/tickets/${softRemoveTicketId}/attachments`)
      .query({ requesterId })
      .attach('file', JPEG_BYTES, { filename: 'double-remove.jpg', contentType: 'image/jpeg' })
    const attachmentId = uploadRes.body.id

    await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .send({ requesterId, reason: 'First removal' })

    const secondRemove = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .send({ requesterId, reason: 'Second removal attempt' })

    expect(secondRemove.status).toBe(409)
  })
})
