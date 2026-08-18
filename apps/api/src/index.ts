import { app } from './server.js'

// A Worker's default export is its fetch handler — Hono apps satisfy that shape
// directly, so there is no server to start.
export default app
