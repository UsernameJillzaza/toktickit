import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../src/app'

// Issue #15 (Lab 2 §5.3): the related-systems endpoint returns the seeded
// reference data, sorted by name.
describe('GET /api/related-systems', () => {
  it('returns at least the 7 seeded related systems, sorted by name', async () => {
    const res = await request(app).get('/api/related-systems')

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(6)

    const names: string[] = res.body.map((r: { name: string }) => r.name)
    // Assert all 7 seeded names, not just a sample — a missing seed item
    // should fail this test, not slip through unnoticed.
    expect(names).toEqual(
      expect.arrayContaining([
        'Email',
        'Campus Wi-Fi',
        'VPN',
        'LEB2 App',
        'Grade Submission App',
        'Printer',
        'Corporate Laptop',
      ]),
    )

    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)

    expect(res.body[0]).toHaveProperty('id')
  })
})
