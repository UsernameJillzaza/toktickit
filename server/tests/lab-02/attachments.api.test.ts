import fs from 'node:fs'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent } from '../helpers/auth'

// Lab 3 (L3-4): every call runs as the signed-in owner of the fixture
// tickets; requesterId is no longer sent. Upload folders and rows are
// removed by cleanupTestUsers().

let requesterId: number
let agent: TestAgent
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
  return ticket.id
}

beforeAll(async () => {
  const requester = await createLoggedInUser({ role: 'REQUESTER' })
  requesterId = requester.user.id
  agent = requester.agent
  ticketId = await newFixtureTicket()
  softRemoveTicketId = await newFixtureTicket()
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

// API-05 (BR-12): a valid, small JPEG uploads successfully.
describe('POST /api/tickets/:id/attachments — valid upload', () => {
  it('returns 201 with attachment metadata', async () => {
    const res = await agent
      .post(`/api/tickets/${ticketId}/attachments`)
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

    const res = await agent
      .post(`/api/tickets/${ticketId}/attachments`)
      .attach('file', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(400)
  })

  it('still accepts a valid file afterward', async () => {
    const res = await agent
      .post(`/api/tickets/${ticketId}/attachments`)
      .attach('file', JPEG_BYTES, { filename: 'photo-after-reject.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(201)
  })
})

describe('POST /api/tickets/:id/attachments — unsupported file type', () => {
  it('rejects an .exe-style mime type', async () => {
    const res = await agent
      .post(`/api/tickets/${ticketId}/attachments`)
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
      const res = await agent
        .post(`/api/tickets/${ticketId}/attachments`)
        .attach('file', JPEG_BYTES, { filename: `fill-${i}.jpg`, contentType: 'image/jpeg' })
      expect(res.status).toBe(201)
    }

    const sixth = await agent
      .post(`/api/tickets/${ticketId}/attachments`)
      .attach('file', JPEG_BYTES, { filename: 'sixth.jpg', contentType: 'image/jpeg' })

    expect(sixth.status).toBe(400)
  })
})

// API-08 (AC-11, BR-15) + API-09 (BR-14): soft-remove blocks download but
// keeps the row (and the file) — never a hard delete.
describe('soft-remove lifecycle', () => {
  it('removes an attachment, keeps its row, and blocks its download', async () => {
    const uploadRes = await agent
      .post(`/api/tickets/${softRemoveTicketId}/attachments`)
      .attach('file', JPEG_BYTES, { filename: 'to-be-removed.jpg', contentType: 'image/jpeg' })
    expect(uploadRes.status).toBe(201)
    const attachmentId = uploadRes.body.id

    const beforeRow = await prisma.attachment.findUnique({ where: { id: attachmentId } })
    expect(beforeRow).not.toBeNull()
    expect(fs.existsSync(beforeRow!.storagePath)).toBe(true)

    const removeRes = await agent
      .post(`/api/attachments/${attachmentId}/remove`)
      .send({ reason: 'Uploaded the wrong file' })
    expect(removeRes.status).toBe(200)
    expect(removeRes.body.isRemoved).toBe(true)

    // BR-14: the row and the file on disk both still exist.
    const afterRow = await prisma.attachment.findUnique({ where: { id: attachmentId } })
    expect(afterRow).not.toBeNull()
    expect(afterRow!.isRemoved).toBe(true)
    expect(fs.existsSync(afterRow!.storagePath)).toBe(true)

    // BR-15: metadata is still visible...
    const metadataRes = await agent
      .get(`/api/attachments/${attachmentId}`)
    expect(metadataRes.status).toBe(200)
    expect(metadataRes.body.isRemoved).toBe(true)

    // ...but download is blocked.
    const downloadRes = await agent
      .get(`/api/attachments/${attachmentId}/download`)
    expect(downloadRes.status).toBe(404)
  })

  it('returns 409 when removing an already-removed attachment again', async () => {
    const uploadRes = await agent
      .post(`/api/tickets/${softRemoveTicketId}/attachments`)
      .attach('file', JPEG_BYTES, { filename: 'double-remove.jpg', contentType: 'image/jpeg' })
    const attachmentId = uploadRes.body.id

    await agent
      .post(`/api/attachments/${attachmentId}/remove`)
      .send({ reason: 'First removal' })

    const secondRemove = await agent
      .post(`/api/attachments/${attachmentId}/remove`)
      .send({ reason: 'Second removal attempt' })

    expect(secondRemove.status).toBe(409)
  })
})
