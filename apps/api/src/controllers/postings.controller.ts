import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm'
import type { Database } from '@repo/db'
import { postings, recruiters } from '@repo/db'
import { type PaginationParams, pageToOffset } from '../utils/pagination.js'

// ==========================================
// TYPES
// ==========================================

export type SortField = 'createdAt' | 'deadline' | 'title'
export type SortOrder = 'asc' | 'desc'

export interface PostingFilters {
  /** Full-text search over title and description (case-insensitive partial match) */
  q?: string
  /** Technology stack tags — returns postings that share ≥1 tag (array overlap) */
  stack?: string[]
  /** Employment type — exact match */
  employmentType?: 'internship' | 'full_time' | 'part_time' | 'contract'
  /** Work arrangement — exact match */
  workArrangement?: 'in_person' | 'remote' | 'hybrid'
  /** Location — case-insensitive partial match */
  location?: string
  /** Deadline on or before this date (ISO 8601 date string, e.g. "2025-12-31") */
  deadlineBefore?: string
  /** Deadline on or after this date */
  deadlineAfter?: string
  /** Sort field */
  sortBy?: SortField
  /** Sort direction */
  order?: SortOrder
}

// Shape returned by both listing and detail queries
export const postingSelectFields = {
  id: postings.id,
  title: postings.title,
  description: postings.description,
  stack: postings.stack,
  employmentType: postings.employmentType,
  workArrangement: postings.workArrangement,
  seniorityLevel: postings.seniorityLevel,
  compensation: postings.compensation,
  location: postings.location,
  deadline: postings.deadline,
  status: postings.status,
  createdAt: postings.createdAt,
  updatedAt: postings.updatedAt,
  recruiter: {
    companyName: recruiters.companyName,
    companyUrl: recruiters.companyUrl,
    companyMail: recruiters.companyMail,
    headquartersLocation: recruiters.headquartersLocation,
  },
} as const

// ==========================================
// QUERY BUILDER HELPERS
// ==========================================

/**
 * Returns the SQL column expression to sort by.
 */
function sortColumn(field: SortField) {
  switch (field) {
    case 'deadline':
      return postings.deadline
    case 'title':
      return postings.title
    case 'createdAt':
    default:
      return postings.createdAt
  }
}

/**
 * Builds the WHERE conditions that are shared between the listing and count
 * queries. Active-only guard is always applied:
 *   status = 'active' AND (deadline IS NULL OR deadline >= today)
 */
function buildWhereConditions(filters: PostingFilters) {
  const today = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"

  const conditions = [
    // Active-only guard
    eq(postings.status, 'active'),
    or(isNull(postings.deadline), gte(postings.deadline, today)),
  ]

  // Text search — ilike on title OR description
  if (filters.q) {
    const pattern = `%${filters.q}%`
    conditions.push(or(ilike(postings.title, pattern), ilike(postings.description, pattern))!)
  }

  // Stack filter — array overlap: posting.stack && ARRAY[...requested tags]
  if (filters.stack && filters.stack.length > 0) {
    // drizzle-orm 0.43 exposes arrayOverlaps; fall back to raw sql for safety
    const tagArray = sql`ARRAY[${sql.join(
      filters.stack.map((t) => sql`${t}`),
      sql`, `,
    )}]::text[]`
    conditions.push(sql`${postings.stack} && ${tagArray}`)
  }

  // Employment type
  if (filters.employmentType) {
    conditions.push(eq(postings.employmentType, filters.employmentType))
  }

  // Work arrangement
  if (filters.workArrangement) {
    conditions.push(eq(postings.workArrangement, filters.workArrangement))
  }

  // Location — partial match
  if (filters.location) {
    conditions.push(ilike(postings.location, `%${filters.location}%`))
  }

  // Deadline range
  if (filters.deadlineBefore) {
    conditions.push(lte(postings.deadline, filters.deadlineBefore))
  }
  if (filters.deadlineAfter) {
    conditions.push(gte(postings.deadline, filters.deadlineAfter))
  }

  return and(...conditions)
}

// ==========================================
// SERVICE FUNCTIONS
// ==========================================

/**
 * Returns a paginated list of active, non-expired job postings with recruiter
 * details. Supports text search, multi-value filters, and deterministic sorting.
 */
export async function listActivePostings(
  db: Database,
  filters: PostingFilters,
  pagination: PaginationParams,
): Promise<{
  rows: (typeof postingSelectFields extends Record<string, infer V> ? V : never)[]
  total: number
}> {
  const where = buildWhereConditions(filters)

  const sortBy = filters.sortBy ?? 'createdAt'
  const order = filters.order ?? 'desc'
  const col = sortColumn(sortBy)
  const orderExpr = order === 'asc' ? asc(col) : desc(col)
  // Secondary sort on id ensures deterministic ordering when primary key ties
  const secondaryOrder = asc(postings.id)

  const offset = pageToOffset(pagination.page, pagination.limit)

  const [rows, countResult] = await Promise.all([
    db
      .select(postingSelectFields)
      .from(postings)
      .innerJoin(recruiters, eq(postings.recruiterId, recruiters.userId))
      .where(where)
      .orderBy(orderExpr, secondaryOrder)
      .limit(pagination.limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(postings)
      .innerJoin(recruiters, eq(postings.recruiterId, recruiters.userId))
      .where(where),
  ])

  const total = countResult[0]?.count ?? 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { rows: rows as any[], total }
}

/**
 * Returns full details for a single posting (must be active and not expired).
 * Returns `null` when the posting does not exist, is closed, or is expired.
 */
export async function getPostingById(db: Database, id: string) {
  const today = new Date().toISOString().slice(0, 10)

  const rows = await db
    .select(postingSelectFields)
    .from(postings)
    .innerJoin(recruiters, eq(postings.recruiterId, recruiters.userId))
    .where(
      and(
        eq(postings.id, id),
        eq(postings.status, 'active'),
        or(isNull(postings.deadline), gte(postings.deadline, today)),
      ),
    )
    .limit(1)

  return rows[0] ?? null
}
