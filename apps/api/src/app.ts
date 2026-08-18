import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { dbMiddleware } from './middleware/db.js'
import { postingsRouter } from './routes/postings.js'

const app = new Hono<{ Bindings: { DATABASE_URL: string } }>()

app.use('*', logger())
app.use('*', dbMiddleware)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/api/hello', (c) => c.json({ message: 'Hello from Hono' }))

// Student job discovery
app.route('/api/postings', postingsRouter)

export { app }
export type AppType = typeof app
