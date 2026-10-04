import type { Priority, TicketStatus } from '../src/generated/prisma/client'

// Lab 3 spec section 7: at least 20 sample tickets spread across requesters,
// statuses, priorities, and owned / unowned — so the IT Staff queue has
// something realistic to filter and sort. Fictional, nothing sensitive.
// `requester` / `owner` are the local part of an @toktickit.test email.

export type SeedTicket = {
  requester: string
  owner: string | null
  category: string
  relatedSystem: string
  summary: string
  description: string
  requestedPriority: Exclude<Priority, 'CRITICAL'>
  itPriority: Priority
  status: TicketStatus
  createdDaysAgo: number
  updatedDaysAgo: number
  requesterReportedResolved?: boolean
}

export const SEED_TICKETS: SeedTicket[] = [
  // NEW — nobody has looked yet (BR-18: no owner)
  { requester: 'jennifer.anderson', owner: null, category: 'Network', relatedSystem: 'Campus Wi-Fi', summary: 'Wi-Fi drops in the library reading room', description: 'The connection drops every few minutes on the second floor of the library.', requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'NEW', createdDaysAgo: 1, updatedDaysAgo: 1 },
  { requester: 'pim.rattanakorn', owner: null, category: 'Software', relatedSystem: 'LEB2 App', summary: 'LEB2 app shows a blank page after login', description: 'After signing in, the course list never loads and the page stays white.', requestedPriority: 'HIGH', itPriority: 'HIGH', status: 'NEW', createdDaysAgo: 0, updatedDaysAgo: 0 },
  { requester: 'somchai.suksawat', owner: null, category: 'Hardware', relatedSystem: 'Printer', summary: 'Printer on floor 4 prints faded pages', description: 'Every page from the floor 4 printer is pale grey and hard to read.', requestedPriority: 'LOW', itPriority: 'LOW', status: 'NEW', createdDaysAgo: 2, updatedDaysAgo: 2 },
  { requester: 'nattaya.chaiyaporn', owner: null, category: 'Account and Access', relatedSystem: 'Email', summary: 'Cannot open shared department mailbox', description: 'The shared mailbox disappeared from my mail client this morning.', requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'NEW', createdDaysAgo: 0, updatedDaysAgo: 0 },

  // OPEN — triaged, some still waiting for an owner
  { requester: 'michael.brown', owner: null, category: 'Network', relatedSystem: 'VPN', summary: 'VPN disconnects every 10 minutes', description: 'The VPN client reconnects on its own roughly every ten minutes when working from home.', requestedPriority: 'MEDIUM', itPriority: 'HIGH', status: 'OPEN', createdDaysAgo: 3, updatedDaysAgo: 2 },
  { requester: 'pim.rattanakorn', owner: null, category: 'Software', relatedSystem: 'Grade Submission App', summary: 'Grade export button does nothing', description: 'Clicking "Export to CSV" on the grade page has no effect in any browser.', requestedPriority: 'HIGH', itPriority: 'CRITICAL', status: 'OPEN', createdDaysAgo: 1, updatedDaysAgo: 0 },
  { requester: 'jennifer.anderson', owner: 'siriporn.kaewmanee', category: 'Hardware', relatedSystem: 'Corporate Laptop', summary: 'Laptop fan is very loud during video calls', description: 'The fan runs at full speed during every video call and the laptop gets hot.', requestedPriority: 'LOW', itPriority: 'LOW', status: 'OPEN', createdDaysAgo: 5, updatedDaysAgo: 4 },
  { requester: 'somchai.suksawat', owner: 'daniel.lee', category: 'Account and Access', relatedSystem: 'LEB2 App', summary: 'Need access to the new course shell', description: 'I was added as a teaching assistant but cannot see the course shell yet.', requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'OPEN', createdDaysAgo: 4, updatedDaysAgo: 3 },

  // IN_PROGRESS — always owned (BR-23)
  { requester: 'michael.brown', owner: 'arthit.wongsa', category: 'Network', relatedSystem: 'Campus Wi-Fi', summary: 'No Wi-Fi signal in meeting room B2', description: 'Meeting room B2 shows the network but cannot connect at all.', requestedPriority: 'HIGH', itPriority: 'HIGH', status: 'IN_PROGRESS', createdDaysAgo: 6, updatedDaysAgo: 1 },
  { requester: 'nattaya.chaiyaporn', owner: 'arthit.wongsa', category: 'Software', relatedSystem: 'Email', summary: 'Calendar invites arrive one hour late', description: 'Meeting invitations show up about an hour after they were sent.', requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'IN_PROGRESS', createdDaysAgo: 7, updatedDaysAgo: 2, requesterReportedResolved: true },
  { requester: 'pim.rattanakorn', owner: 'napat.chaiwong', category: 'Account and Access', relatedSystem: 'Email', summary: 'Locked out after password reset email', description: 'The reset link in the email says it has expired as soon as I open it.', requestedPriority: 'HIGH', itPriority: 'CRITICAL', status: 'IN_PROGRESS', createdDaysAgo: 2, updatedDaysAgo: 0 },
  { requester: 'jennifer.anderson', owner: 'siriporn.kaewmanee', category: 'Software', relatedSystem: 'Corporate Laptop', summary: 'Office updates fail with error 30088', description: 'Every night the update tries again and fails with the same error code.', requestedPriority: 'LOW', itPriority: 'MEDIUM', status: 'IN_PROGRESS', createdDaysAgo: 9, updatedDaysAgo: 3 },

  // WAITING_FOR_REQUESTER — owned, ball is in the requester's court
  { requester: 'somchai.suksawat', owner: 'daniel.lee', category: 'Hardware', relatedSystem: 'Corporate Laptop', summary: 'Docking station not detecting second monitor', description: 'Only one of my two monitors works when the laptop is docked.', requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'WAITING_FOR_REQUESTER', createdDaysAgo: 8, updatedDaysAgo: 5 },
  { requester: 'michael.brown', owner: 'siriporn.kaewmanee', category: 'Software', relatedSystem: 'LEB2 App', summary: 'Quiz timer resets when switching tabs', description: 'Students report the quiz timer starts again after they switch browser tabs.', requestedPriority: 'HIGH', itPriority: 'HIGH', status: 'WAITING_FOR_REQUESTER', createdDaysAgo: 10, updatedDaysAgo: 6 },

  // RESOLVED — fixed, waiting to be closed
  { requester: 'nattaya.chaiyaporn', owner: 'daniel.lee', category: 'Hardware', relatedSystem: 'Printer', summary: 'Badge reader on printer 2 rejects cards', description: 'Holding a staff card to the printer reader shows "card not recognised".', requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'RESOLVED', createdDaysAgo: 12, updatedDaysAgo: 2 },
  { requester: 'pim.rattanakorn', owner: 'arthit.wongsa', category: 'Network', relatedSystem: 'VPN', summary: 'VPN certificate warning on new laptop', description: 'The VPN client warns that the server certificate is not trusted.', requestedPriority: 'LOW', itPriority: 'LOW', status: 'RESOLVED', createdDaysAgo: 11, updatedDaysAgo: 1 },

  // REOPENED — came back after being resolved (owned)
  { requester: 'jennifer.anderson', owner: 'arthit.wongsa', category: 'Network', relatedSystem: 'Campus Wi-Fi', summary: 'Wi-Fi login page loops back to start', description: 'The campus Wi-Fi sign-in page keeps returning to the first step.', requestedPriority: 'MEDIUM', itPriority: 'HIGH', status: 'REOPENED', createdDaysAgo: 15, updatedDaysAgo: 1 },

  // Terminal — CLOSED / CANCELLED (excluded from the default queue)
  { requester: 'michael.brown', owner: 'siriporn.kaewmanee', category: 'Account and Access', relatedSystem: 'Grade Submission App', summary: 'Grade app role shows Student instead of Lecturer', description: 'My account was showing the student view of the grade app.', requestedPriority: 'HIGH', itPriority: 'HIGH', status: 'CLOSED', createdDaysAgo: 20, updatedDaysAgo: 14 },
  { requester: 'david.wilson', owner: 'ploy.srisuk', category: 'Hardware', relatedSystem: 'Corporate Laptop', summary: 'Laptop battery swells and lifts the keyboard', description: 'The keyboard has started to bulge upwards near the trackpad.', requestedPriority: 'HIGH', itPriority: 'CRITICAL', status: 'CLOSED', createdDaysAgo: 30, updatedDaysAgo: 25 },
  { requester: 'somchai.suksawat', owner: null, category: 'Software', relatedSystem: 'Email', summary: 'Duplicate of mailbox quota ticket', description: 'Opened twice by mistake — the other ticket covers the same mailbox quota issue.', requestedPriority: 'LOW', itPriority: 'LOW', status: 'CANCELLED', createdDaysAgo: 6, updatedDaysAgo: 6 },
  { requester: 'nattaya.chaiyaporn', owner: 'napat.chaiwong', category: 'Network', relatedSystem: 'VPN', summary: 'Request VPN access for a visiting researcher', description: 'The visit was cancelled, so the VPN account is no longer needed.', requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'CANCELLED', createdDaysAgo: 13, updatedDaysAgo: 9 },

  // A few more open work items so the queue has more than one page
  { requester: 'pim.rattanakorn', owner: 'daniel.lee', category: 'Hardware', relatedSystem: 'Printer', summary: 'Scanner saves files with no name', description: 'Scanned documents arrive in my inbox as attachments with an empty filename.', requestedPriority: 'LOW', itPriority: 'LOW', status: 'IN_PROGRESS', createdDaysAgo: 4, updatedDaysAgo: 1 },
  { requester: 'michael.brown', owner: null, category: 'Account and Access', relatedSystem: 'Email', summary: 'Mailbox almost full warning every hour', description: 'I keep getting a quota warning although I archived most old mail.', requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', status: 'OPEN', createdDaysAgo: 2, updatedDaysAgo: 2 },
]
