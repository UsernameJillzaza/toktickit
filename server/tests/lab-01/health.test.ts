import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../src/app'

// API-01 (Lab 1 §7.2, §10.1): the health endpoint returns 200 and the exact JSON contract.
describe('GET /api/health', () => {
  it('returns 200 with status "ok" and the service name', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'TokTickIT API' })
  })
})
