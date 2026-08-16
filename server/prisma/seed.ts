import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

// Prisma 7's client generator requires an explicit driver adapter.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// §7.3: the seed must insert exactly these four categories and be safe to
// run more than once without creating duplicates.
const CATEGORIES = ['Account and Access', 'Hardware', 'Software', 'Network']

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
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
