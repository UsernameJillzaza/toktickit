import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

// Prisma 7's client generator requires an explicit driver adapter.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// §7.3: the seed must insert exactly these four categories and be safe to
// run more than once without creating duplicates.
const CATEGORIES = ['Account and Access', 'Hardware', 'Software', 'Network']

// Lab 2 §5.3: at least four active Development Requesters and at least one
// inactive one (the inactive row must never appear in the selector — BR-05).
const DEV_REQUESTERS: { name: string; email: string; isActive: boolean }[] = [
  { name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test', isActive: true },
  { name: 'Michael Brown', email: 'michael.brown@toktickit.test', isActive: true },
  { name: 'Somchai Suksawat', email: 'somchai.suksawat@toktickit.test', isActive: true },
  { name: 'Nattaya Chaiyaporn', email: 'nattaya.chaiyaporn@toktickit.test', isActive: true },
  { name: 'David Wilson (inactive)', email: 'david.wilson@toktickit.test', isActive: false },
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

  for (const requester of DEV_REQUESTERS) {
    await prisma.devRequester.upsert({
      where: { email: requester.email },
      update: {},
      create: requester,
    })
  }
  console.log(`Seeded ${DEV_REQUESTERS.length} development requesters`)

  for (const name of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }
  console.log(`Seeded ${RELATED_SYSTEMS.length} related systems`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
