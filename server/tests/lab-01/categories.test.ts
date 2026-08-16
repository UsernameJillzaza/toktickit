import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../src/app'

// API-02 (Lab 1 §7.4, §10.2): the categories endpoint returns the four seeded categories.
// (Requires the database to be seeded first — see `npx prisma db seed`.)
describe('GET /api/categories', () => {
  it('returns 200 with the four seeded categories', async () => {
    const res = await request(app).get('/api/categories')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(4)

    // Assert the exact order, not just presence — §7.4 requires a predictable
    // order and §10.2 specifies ascending id. `toContain` would pass even if
    // the API returned rows in an arbitrary order.
    const names = res.body.map((c: { name: string }) => c.name)
    expect(names).toEqual(['Account and Access', 'Hardware', 'Software', 'Network'])

    expect(res.body[0]).toHaveProperty('id')
  })
})
