import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../src/app'

// API-01 (tests.md): GET /api/requesters returns only isActive=true rows —
// the seeded inactive requester (BR-05) must never appear.
describe('GET /api/requesters', () => {
  it('returns only active requesters, sorted by name', async () => {
    const res = await request(app).get('/api/requesters')

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(4)

    const names: string[] = res.body.map((r: { name: string }) => r.name)
    expect(names).not.toContain('David Wilson (inactive)')

    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)

    expect(res.body[0]).toHaveProperty('id')
    expect(res.body[0]).toHaveProperty('email')
  })
})
