import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyTickets from '../../src/tickets/MyTickets'
import { AuthProvider } from '../../src/auth/AuthContext'

// Lab 4 hardening (BR-36): raw enum codes never reach a screen. My Tickets
// used to print NEW / MEDIUM; it now uses the same badges as the detail screen.

const ME = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test', role: 'REQUESTER' as const, mustChangePassword: false }

afterEach(() => vi.unstubAllGlobals())

describe('My Tickets shows readable status and priority', () => {
  it('prints "Waiting for Requester" and "Medium", never the codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: 1, ticketNumber: 'TKT-2026-000001', summary: 'Laptop battery drains quickly', requestedPriority: 'MEDIUM', currentStatus: 'WAITING_FOR_REQUESTER', createdAt: '2026-09-01T00:00:00Z', category: { name: 'Hardware' } }],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
      })),
    )
    render(
      <MemoryRouter>
        <AuthProvider initialUser={ME}>
          <MyTickets />
        </AuthProvider>
      </MemoryRouter>,
    )
    await screen.findAllByText('Laptop battery drains quickly')
    expect(screen.getAllByText('Waiting for Requester')[0]).toHaveClass('tt-badge', 'tt-badge-status-WAITING_FOR_REQUESTER')
    expect(screen.getAllByText('Medium')[0]).toHaveClass('tt-badge-priority-MEDIUM')
    expect(screen.queryByText('WAITING_FOR_REQUESTER')).not.toBeInTheDocument()
    expect(screen.queryByText('MEDIUM')).not.toBeInTheDocument()
  })
})
