import type { PrismaClient } from '../src/generated/prisma/client'

// Lab 4 spec Section 7 (FR-17): sample Actions Taken on a few of the seeded
// Tickets. Most Tickets deliberately keep **zero** Actions (legacy behaviour,
// BR-21); some have one; some have several, done by different staff, in every
// status, with and without follow-up — so the Actions area, the resolution
// gate and the dashboards all have something real to show. Fictional text.
//
// Rules the data keeps true (so the seed never contradicts the gate):
//   * a RESOLVED or CLOSED Ticket has at least one COMPLETED Action and no OPEN one;
//   * a Ticket with an OPEN Action is in a workable status (BR-11).
// `ticket` is the seeded summary; `by` is who did it and `createdBy` who
// recorded it (email local parts of @toktickit.test). Safe to run again: an
// Action is identified by (Ticket, key) and an existing one is left alone.

export type SeedAction = {
  key: string
  ticket: string
  by: string
  createdBy: string
  description: string
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED'
  result?: string
  followUp?: string
  attachmentNotes?: string
  /** Hours after the Ticket was created that the action happened. */
  hoursAfterCreate: number
}

export const SEED_ACTIONS: SeedAction[] = [
  // Several actions, by different staff: the "different performers on one Ticket" case.
  {
    key: 'seed-b2-1', ticket: 'No Wi-Fi signal in meeting room B2', by: 'arthit.wongsa', createdBy: 'arthit.wongsa',
    description: 'Checked the access point in the controller and on site', status: 'COMPLETED',
    result: 'AP-B2-01 is offline in the controller; the cable is fine and the PoE port is dead.', hoursAfterCreate: 3,
  },
  {
    key: 'seed-b2-2', ticket: 'No Wi-Fi signal in meeting room B2', by: 'siriporn.kaewmanee', createdBy: 'siriporn.kaewmanee',
    description: 'Moved the access point to a spare PoE port on the second switch', status: 'COMPLETED',
    result: 'AP-B2-01 is back online and clients can join.', followUp: 'Watch the port for 24 hours in case the first one is failing.',
    attachmentNotes: 'Photo of the patch panel is in the shared folder "Network / B2".', hoursAfterCreate: 5,
  },
  {
    key: 'seed-b2-3', ticket: 'No Wi-Fi signal in meeting room B2', by: 'arthit.wongsa', createdBy: 'napat.chaiwong',
    description: 'Replace the dead PoE port and label the new one', status: 'OPEN', hoursAfterCreate: 8,
  },

  // One completed, one open.
  {
    key: 'seed-cal-1', ticket: 'Calendar invites arrive one hour late', by: 'arthit.wongsa', createdBy: 'arthit.wongsa',
    description: 'Compared the time-zone settings of the mailbox and the calendar service', status: 'COMPLETED',
    result: 'The calendar service was still on UTC; the mailbox is on UTC+7.', hoursAfterCreate: 2,
  },
  {
    key: 'seed-cal-2', ticket: 'Calendar invites arrive one hour late', by: 'arthit.wongsa', createdBy: 'arthit.wongsa',
    description: 'Change the calendar service to UTC+7 after the maintenance window', status: 'OPEN', hoursAfterCreate: 4,
  },

  // Completed and cancelled.
  {
    key: 'seed-dock-1', ticket: 'Docking station not detecting second monitor', by: 'daniel.lee', createdBy: 'daniel.lee',
    description: 'Asked for the docking station model and firmware version', status: 'COMPLETED',
    result: 'Model DK-210, firmware 1.0.4. A newer firmware exists.', hoursAfterCreate: 2,
  },
  {
    key: 'seed-dock-2', ticket: 'Docking station not detecting second monitor', by: 'daniel.lee', createdBy: 'daniel.lee',
    description: 'Swap the docking station for a loan unit', status: 'CANCELLED',
    result: 'No loan unit is needed: the firmware update below is enough.', hoursAfterCreate: 3,
  },

  // Resolved and closed Tickets: finished work only.
  {
    key: 'seed-badge-1', ticket: 'Badge reader on printer 2 rejects cards', by: 'daniel.lee', createdBy: 'daniel.lee',
    description: 'Re-registered the badge reader with the print server', status: 'COMPLETED',
    result: 'Cards are accepted again; tested with three badges.', hoursAfterCreate: 6,
  },
  {
    key: 'seed-grade-1', ticket: 'Grade app role shows Student instead of Lecturer', by: 'siriporn.kaewmanee', createdBy: 'siriporn.kaewmanee',
    description: 'Corrected the role mapping for the lecturer group in the identity provider', status: 'COMPLETED',
    result: 'The role shows Lecturer after the next sign-in.', followUp: 'Ask the lecturer to confirm after signing in again.', hoursAfterCreate: 4,
  },

  // Reopened: the first fix did not hold, so there is both a completed and an open action.
  {
    key: 'seed-loop-1', ticket: 'Wi-Fi login page loops back to start', by: 'arthit.wongsa', createdBy: 'arthit.wongsa',
    description: 'Renewed the captive portal certificate', status: 'COMPLETED',
    result: 'The portal worked for a few days.', followUp: 'The symptom came back after the weekend; check the certificate chain.', hoursAfterCreate: 5,
  },
  {
    key: 'seed-loop-2', ticket: 'Wi-Fi login page loops back to start', by: 'siriporn.kaewmanee', createdBy: 'arthit.wongsa',
    description: 'Check the intermediate certificate on the portal server', status: 'OPEN', hoursAfterCreate: 30,
  },

  // An Administrator as performer next to IT Staff.
  {
    key: 'seed-lock-1', ticket: 'Locked out after password reset email', by: 'napat.chaiwong', createdBy: 'napat.chaiwong',
    description: 'Unlocked the account and checked the reset link lifetime', status: 'COMPLETED',
    result: 'Reset links expire after 10 minutes; the mail gateway delays them by about 12.', hoursAfterCreate: 1,
  },
  {
    key: 'seed-lock-2', ticket: 'Locked out after password reset email', by: 'daniel.lee', createdBy: 'napat.chaiwong',
    description: 'Ask the mail team to stop greylisting the reset sender', status: 'OPEN', hoursAfterCreate: 2,
  },
]

const HOUR_MS = 60 * 60 * 1000

export async function seedActions(prisma: PrismaClient): Promise<{ total: number; created: number }> {
  let created = 0
  for (const a of SEED_ACTIONS) {
    const ticket = await prisma.ticket.findFirst({ where: { summary: a.ticket }, orderBy: { id: 'asc' } })
    if (!ticket) continue // the ticket seed is skipped or was changed: nothing to attach to
    const exists = await prisma.actionTaken.findFirst({ where: { ticketId: ticket.id, requestKey: a.key } })
    if (exists) continue
    const [by, createdBy] = await Promise.all(
      [a.by, a.createdBy].map((local) => prisma.user.findUniqueOrThrow({ where: { email: `${local}@toktickit.test` } })),
    )
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        requestKey: a.key,
        actionAt: new Date(ticket.createdAt.getTime() + a.hoursAfterCreate * HOUR_MS),
        description: a.description,
        status: a.status,
        result: a.result ?? null,
        followUpRequired: Boolean(a.followUp),
        followUpNote: a.followUp ?? null,
        attachmentNotes: a.attachmentNotes ?? null,
        performedById: by.id,
        createdById: createdBy.id,
        // Seeded work is "already done": version counts the steps it went through.
        version: a.status === 'OPEN' ? 1 : 2,
      },
    })
    created++
  }
  return { total: SEED_ACTIONS.length, created }
}
