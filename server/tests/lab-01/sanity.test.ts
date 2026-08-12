import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../src/app'

// Placeholder proving Supertest + Vitest are configured (Issue #1, §7.1).
// Real API tests (GET /api/health, GET /api/categories) arrive in Issues #2 and #4.
describe('server configuration', () => {
  it('responds on the liveness route', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.service).toBe('TokTickIT API')
  })
})
