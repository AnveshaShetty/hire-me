import { describe, expect, it } from 'vitest'

import { app } from '../app.js'

process.env.DATABASE_URL = 'postgresql://fake'

describe('api', () => {
  it('reports healthy', async () => {
    const res = await app.request('/health', {}, { DATABASE_URL: 'postgresql://fake' })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })

  it('returns a greeting', async () => {
    const res = await app.request('/api/hello', {}, { DATABASE_URL: 'postgresql://fake' })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ message: 'Hello from Hono' })
  })

  it('404s an unknown route', async () => {
    const res = await app.request('/nope', {}, { DATABASE_URL: 'postgresql://fake' })

    expect(res.status).toBe(404)
  })
})
