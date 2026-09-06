import type { PrismaClient } from './generated/prisma/client'

// BR-01: `TKT-<year>-<6-digit running number>`, sequential within each year,
// unique system-wide. Based on the highest existing number (not a row count)
// so a gap from a deleted ticket never causes the next number to collide
// with one that's still in use — a count-based version of this broke
// exactly that way once a row got deleted. Still races under true
// concurrent creation (see tests.md §7 Known Limitations), guarded at the
// call site by retrying on a unique constraint violation.
export async function generateTicketNumber(prisma: PrismaClient): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TKT-${year}-`

  const last = await prisma.ticket.findFirst({
    where: { ticketNumber: { startsWith: prefix } },
    orderBy: { ticketNumber: 'desc' },
  })

  const lastSeq = last ? parseInt(last.ticketNumber.slice(prefix.length), 10) : 0
  const next = (lastSeq + 1).toString().padStart(6, '0')
  return `${prefix}${next}`
}
