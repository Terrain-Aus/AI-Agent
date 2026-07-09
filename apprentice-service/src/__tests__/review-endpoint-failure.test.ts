// M4A — POST /review internal-failure conversion.
//
// deterministicReview is pure and cannot throw on a guard-valid request with
// the default hard-floor config, so the 500 path is exercised by module-mocking
// the review module (this file only — the real function runs everywhere else).
// The adapter must convert ANY internal throw into a safe, static 500 body:
// no raw error message, no stack trace, no request echo.

import { describe, it, expect, vi } from 'vitest'
import { handleReviewEndpoint } from '../endpoint/review-endpoint'

const INTERNAL_SECRET = 'internal-detail: exploded at review.ts:42 (do not leak)'

vi.mock('../review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../review')>()
  return {
    ...actual,
    deterministicReview: async () => {
      throw new Error(INTERNAL_SECRET)
    },
  }
})

const validBody = () => ({
  reviewContractVersion: 1,
  quoteId: 'q_500',
  operatorId: 'op_dave',
  quote: { quoteId: 'q_500' },
  validation: { status: 'PASS', findings: [] },
})

describe('M4A endpoint — internal failure is converted to a safe 500', () => {
  it('returns 500 REVIEW_FAILED with the static safe body', async () => {
    const response = await handleReviewEndpoint({ method: 'POST', path: '/review', body: validBody() })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: { code: 'REVIEW_FAILED', message: 'Review failed' } })
  })

  it('leaks no raw error message, stack trace, or request body', async () => {
    const response = await handleReviewEndpoint({ method: 'POST', path: '/review', body: validBody() })
    const serialised = JSON.stringify(response)
    expect(serialised).not.toContain(INTERNAL_SECRET)
    expect(serialised).not.toContain('exploded')
    expect(serialised).not.toContain('stack')
    expect(serialised).not.toContain('q_500')
  })

  it('routing errors still take precedence over the failing review (never reached)', async () => {
    const wrongMethod = await handleReviewEndpoint({ method: 'GET', path: '/review', body: validBody() })
    expect(wrongMethod.status).toBe(405)
    const wrongPath = await handleReviewEndpoint({ method: 'POST', path: '/nope', body: validBody() })
    expect(wrongPath.status).toBe(404)
  })
})
