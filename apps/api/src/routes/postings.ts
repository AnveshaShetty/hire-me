import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { DbVariables } from '../middleware/db.js'
import { listActivePostings, getPostingById } from '../controllers/postings.controller.js'
import { buildPaginationMeta, PAGINATION_DEFAULTS } from '../utils/pagination.js'

// ==========================================
// QUERY PARAM SCHEMAS
// ==========================================

const listPostingsSchema = z.object({
  // Pagination
  page: z
    .string()
    .optional()
    .transform((v) => Math.max(1, parseInt(v ?? '1', 10) || 1)),
  limit: z
    .string()
    .optional()
    .transform((v) =>
      Math.min(PAGINATION_DEFAULTS.maxLimit, Math.max(1, parseInt(v ?? '20', 10) || 20)),
    ),

  // Text search
  q: z.string().optional(),

  // Array filter: ?stack=react&stack=typescript
  stack: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (!v) return undefined
      return Array.isArray(v) ? v : [v]
    }),

  // Enum filters
  employmentType: z.enum(['internship', 'full_time', 'part_time', 'contract']).optional(),
  workArrangement: z.enum(['in_person', 'remote', 'hybrid']).optional(),

  // Partial-match filters
  location: z.string().optional(),

  // Date range (ISO 8601 date strings)
  deadlineBefore: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .optional(),
  deadlineAfter: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .optional(),

  // Sorting
  sortBy: z.enum(['createdAt', 'deadline', 'title']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
})

// ==========================================
// ROUTER
// ==========================================

export const postingsRouter = new Hono<{
  Bindings: { DATABASE_URL: string }
  Variables: DbVariables
}>()

/**
 * GET /api/postings
 * Returns a paginated list of active job postings with optional filters.
 *
 * Query params:
 *   page, limit         — pagination (default: 1, 20; max limit: 100)
 *   q                   — text search (title + description, case-insensitive)
 *   stack               — repeatable tag filter (e.g. ?stack=react&stack=ts)
 *   employmentType      — internship | full_time | part_time | contract
 *   workArrangement     — in_person | remote | hybrid
 *   location            — partial location match
 *   deadlineBefore      — YYYY-MM-DD upper bound on deadline
 *   deadlineAfter       — YYYY-MM-DD lower bound on deadline
 *   sortBy              — createdAt | deadline | title  (default: createdAt)
 *   order               — asc | desc  (default: desc)
 */
postingsRouter.get('/', zValidator('query', listPostingsSchema), async (c) => {
  const query = c.req.valid('query')
  const db = c.var.db

  const pagination = { page: query.page, limit: query.limit }
  const filters = {
    q: query.q,
    stack: query.stack,
    employmentType: query.employmentType,
    workArrangement: query.workArrangement,
    location: query.location,
    deadlineBefore: query.deadlineBefore,
    deadlineAfter: query.deadlineAfter,
    sortBy: query.sortBy,
    order: query.order,
  }

  const { rows, total } = await listActivePostings(db, filters, pagination)
  const meta = buildPaginationMeta(total, pagination)

  return c.json({ data: rows, meta })
})

/**
 * GET /api/postings/:id
 * Returns full details for a single active posting.
 * Responds with 404 if the posting doesn't exist, is closed, or is expired.
 */
postingsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.var.db

  // Basic UUID format guard — avoids a DB round-trip for obviously bad IDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return c.json({ error: 'Posting not found' }, 404)
  }

  const posting = await getPostingById(db, id)
  if (!posting) {
    return c.json({ error: 'Posting not found' }, 404)
  }

  return c.json({ data: posting })
})
