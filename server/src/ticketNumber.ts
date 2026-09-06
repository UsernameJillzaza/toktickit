import type { PrismaClient } from './generated/prisma/client'

// BR-01: `TKT-<year>-<6-digit running number>`, sequential within each year,
// unique system-wide. Counting existing rows (rather than a random suffix)
// is what makes this genuinely sequential, per the approved spec — the
// trade-off is a known race under true concurrent creation (see tests.md
// §7 Known Limitations), guarded at the call site by retrying on a unique
// constraint violation.
export async function generateTicketNumber(prisma: PrismaClient): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TKT-${year}-`

  const count = await prisma.ticket.count({
    where: { ticketNumber: { startsWith: prefix } },
  })

  const next = (count + 1).toString().padStart(6, '0')
  return `${prefix}${next}`
}
