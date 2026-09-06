import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client'
import { generateTicketNumber } from '../../src/ticketNumber'

// UNIT-01 (tests.md): format + uniqueness of the Ticket Number generator.
// BR-01 requires a genuinely sequential number, which means this "unit"
// test does exercise the real DB counter rather than a pure in-memory
// function — see the comment in ticketNumber.ts for why.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const createdTicketIds: number[] = []

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } })
  }
  await prisma.$disconnect()
})

describe('generateTicketNumber', () => {
  it('returns the TKT-YYYY-NNNNNN format and stays unique across 10 real inserts', async () => {
    const requester = await prisma.devRequester.findFirstOrThrow({ where: { isActive: true } })
    const category = await prisma.category.findFirstOrThrow()
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow()

    const numbers: string[] = []

    for (let i = 0; i < 10; i++) {
      const ticketNumber = await generateTicketNumber(prisma)
      expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)

      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber,
          requesterId: requester.id,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: 'Unit test ticket for number generation',
          description: 'Created only to exercise generateTicketNumber() uniqueness.',
          requestedPriority: 'LOW',
        },
      })
      createdTicketIds.push(ticket.id)
      numbers.push(ticketNumber)
    }

    expect(new Set(numbers).size).toBe(10)
  })
})
