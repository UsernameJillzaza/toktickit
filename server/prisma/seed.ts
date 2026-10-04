import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import type { Role } from '../src/generated/prisma/client'
import { hashPassword } from '../src/auth/password'
import { SEED_DEMO_PASSWORD, SEED_INITIAL_PASSWORD } from './seed-credentials'
import { SEED_COMMENTS, SEED_NOTES, SEED_TICKETS } from './seed-tickets'
import { generateTicketNumber } from '../src/ticketNumber'

// Prisma 7's client generator requires an explicit driver adapter.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// §7.3: the seed must insert exactly these four categories and be safe to
// run more than once without creating duplicates.
const CATEGORIES = ['Account and Access', 'Hardware', 'Software', 'Network']

type SeedUser = { name: string; email: string; role: Role; isActive: boolean; ready: boolean }

// Lab 3 §5.3 minimums: ≥4 active + 1 inactive Requester, ≥3 active + 1
// inactive IT Staff, ≥1 active Administrator (two here, so admin safety
// rules can be demonstrated without locking anyone out).
const USERS: SeedUser[] = [
  // Carried over from Lab 2's Development Requesters (same emails → same rows
  // after the add_user_auth migration). ready: false = initial password.
  { name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test', role: 'REQUESTER', isActive: true, ready: false },
  { name: 'Michael Brown', email: 'michael.brown@toktickit.test', role: 'REQUESTER', isActive: true, ready: false },
  { name: 'Somchai Suksawat', email: 'somchai.suksawat@toktickit.test', role: 'REQUESTER', isActive: true, ready: false },
  { name: 'Nattaya Chaiyaporn', email: 'nattaya.chaiyaporn@toktickit.test', role: 'REQUESTER', isActive: true, ready: false },
  { name: 'David Wilson (inactive)', email: 'david.wilson@toktickit.test', role: 'REQUESTER', isActive: false, ready: false },
  // New in Lab 3.
  { name: 'Pim Rattanakorn', email: 'pim.rattanakorn@toktickit.test', role: 'REQUESTER', isActive: true, ready: true },
  { name: 'Arthit Wongsa', email: 'arthit.wongsa@toktickit.test', role: 'IT_STAFF', isActive: true, ready: true },
  { name: 'Siriporn Kaewmanee', email: 'siriporn.kaewmanee@toktickit.test', role: 'IT_STAFF', isActive: true, ready: true },
  { name: 'Daniel Lee', email: 'daniel.lee@toktickit.test', role: 'IT_STAFF', isActive: true, ready: true },
  { name: 'Ploy Srisuk (inactive)', email: 'ploy.srisuk@toktickit.test', role: 'IT_STAFF', isActive: false, ready: true },
  { name: 'Napat Chaiwong', email: 'napat.chaiwong@toktickit.test', role: 'ADMIN', isActive: true, ready: true },
  { name: 'Kanya Thongdee', email: 'kanya.thongdee@toktickit.test', role: 'ADMIN', isActive: true, ready: true },
]

// Lab 2 §5.3: at least six realistic Related Systems.
const RELATED_SYSTEMS = [
  'Email',
  'Campus Wi-Fi',
  'VPN',
  'LEB2 App',
  'Grade Submission App',
  'Printer',
  'Corporate Laptop',
]

async function main() {
  for (const name of CATEGORIES) {
    // upsert (not create): reruns are idempotent — an existing row is left
    // untouched instead of colliding with the unique `name` constraint.
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }
  console.log(`Seeded ${CATEGORIES.length} categories`)

  for (const u of USERS) {
    const password = u.ready ? SEED_DEMO_PASSWORD : SEED_INITIAL_PASSWORD
    const existing = await prisma.user.findUnique({ where: { email: u.email } })
    if (!existing) {
      await prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          passwordHash: await hashPassword(password),
          mustChangePassword: !u.ready,
        },
      })
    } else if (!existing.passwordHash) {
      // BR-40: a requester migrated from Lab 2 has no password yet — issue the
      // initial one. Accounts that already have a password are left alone, so
      // re-running the seed never resets a password someone changed (BR-41).
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await hashPassword(password), mustChangePassword: !u.ready },
      })
    }
  }
  console.log(`Seeded ${USERS.length} users`)

  for (const name of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }
  console.log(`Seeded ${RELATED_SYSTEMS.length} related systems`)

  // Lab 3: sample tickets for the IT Staff queue. A ticket counts as already
  // seeded when the same requester has a ticket with the same summary, so a
  // rerun adds nothing (BR-41) and never touches tickets people changed.
  const DAY_MS = 24 * 60 * 60 * 1000
  let added = 0
  for (const t of SEED_TICKETS) {
    const requester = await prisma.user.findUniqueOrThrow({ where: { email: `${t.requester}@toktickit.test` } })
    const exists = await prisma.ticket.findFirst({ where: { requesterId: requester.id, summary: t.summary } })
    if (exists) continue

    const owner = t.owner
      ? await prisma.user.findUniqueOrThrow({ where: { email: `${t.owner}@toktickit.test` } })
      : null
    const category = await prisma.category.findUniqueOrThrow({ where: { name: t.category } })
    const relatedSystem = await prisma.relatedSystem.findUniqueOrThrow({ where: { name: t.relatedSystem } })
    const createdAt = new Date(Date.now() - t.createdDaysAgo * DAY_MS)
    const updatedAt = new Date(Date.now() - t.updatedDaysAgo * DAY_MS)

    await prisma.ticket.create({
      data: {
        ticketNumber: await generateTicketNumber(prisma),
        requesterId: requester.id,
        ownerId: owner?.id ?? null,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: t.summary,
        description: t.description,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.status,
        requesterResolvedAt: t.requesterReportedResolved ? updatedAt : null,
        createdAt,
        updatedAt,
      },
    })
    added++
  }
  console.log(`Seeded ${SEED_TICKETS.length} sample tickets (${added} new)`)

  // Sample public comments and internal notes. An entry counts as seeded when
  // the same author already wrote the same text on that ticket (BR-41).
  const MINUTE_MS = 60 * 1000
  async function seedEntries(kind: 'comment' | 'note', entries: typeof SEED_COMMENTS) {
    let created = 0
    for (const e of entries) {
      const ticket = await prisma.ticket.findFirst({ where: { summary: e.ticket }, orderBy: { id: 'asc' } })
      if (!ticket) continue
      const author = await prisma.user.findUniqueOrThrow({ where: { email: `${e.author}@toktickit.test` } })
      const where = { ticketId: ticket.id, authorId: author.id, body: e.body }
      const exists = kind === 'comment' ? await prisma.publicComment.findFirst({ where }) : await prisma.internalNote.findFirst({ where })
      if (exists) continue
      const data = { ...where, createdAt: new Date(ticket.createdAt.getTime() + e.minutesAfterCreate * MINUTE_MS) }
      if (kind === 'comment') await prisma.publicComment.create({ data })
      else await prisma.internalNote.create({ data })
      created++
    }
    return created
  }
  const newComments = await seedEntries('comment', SEED_COMMENTS)
  const newNotes = await seedEntries('note', SEED_NOTES)
  console.log(`Seeded ${SEED_COMMENTS.length} comments (${newComments} new) and ${SEED_NOTES.length} internal notes (${newNotes} new)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
