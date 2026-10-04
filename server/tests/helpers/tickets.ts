import { prisma } from '../../src/db'
import type { TestAgent } from './auth'

// Smallest valid PNG (1x1) — enough for multer's MIME filter and a real
// file on disk for the download tests.
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export async function referenceIds() {
  const category = await prisma.category.findFirstOrThrow({ orderBy: { id: 'asc' } })
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ orderBy: { id: 'asc' } })
  return { categoryId: category.id, relatedSystemId: relatedSystem.id }
}

/** Creates a Ticket through the real API, as whoever `agent` is signed in as. */
export async function createTicketAs(agent: TestAgent, summary = 'Printer on floor 3 jams') {
  const res = await agent.post('/api/tickets').send({
    ...(await referenceIds()),
    summary,
    description: 'Every second page jams in tray 2.',
    requestedPriority: 'MEDIUM',
  })
  if (res.status !== 201) throw new Error(`createTicketAs failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body as { id: number; ticketNumber: string }
}

type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED'
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/**
 * Inserts a Ticket straight into the database, for states the API can't
 * reach yet (or would need many steps to reach). The requester must be a
 * test user so cleanupTestUsers() removes it.
 */
export async function insertTicket(options: {
  requesterId: number
  summary: string
  status?: Status
  itPriority?: Priority
  ownerId?: number | null
  categoryId?: number
}) {
  const ids = await referenceIds()
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      requesterId: options.requesterId,
      categoryId: options.categoryId ?? ids.categoryId,
      relatedSystemId: ids.relatedSystemId,
      summary: options.summary,
      description: 'Fixture ticket inserted directly by a test.',
      requestedPriority: options.itPriority === 'CRITICAL' ? 'HIGH' : (options.itPriority ?? 'LOW'),
      itPriority: options.itPriority ?? 'LOW',
      currentStatus: options.status ?? 'NEW',
      ownerId: options.ownerId ?? null,
    },
  })
}

/** Uploads a tiny PNG to the Ticket through the real API. */
export async function uploadAttachmentAs(agent: TestAgent, ticketId: number) {
  const res = await agent
    .post(`/api/tickets/${ticketId}/attachments`)
    .attach('file', TINY_PNG, { filename: 'screen.png', contentType: 'image/png' })
  if (res.status !== 201) throw new Error(`uploadAttachmentAs failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body as { id: number; ticketId: number }
}
