import { describe, it, expect } from 'vitest'
import { VALIDATION_STATUSES, type GuardianReviewRequest } from '../review-request'
import { isGuardianReviewRequest } from '../guards'

const validRequest = (over: Partial<GuardianReviewRequest> = {}): GuardianReviewRequest => ({
  quoteId: 'q_123',
  quote: { quoteId: 'q_123', trade: 'concreting', jobType: 'slab', totals: { total: 9369, marginPct: 22 }, scopeNote: '40m² slab' },
  validation: { status: 'WARN', findings: [{ severity: 'warn', code: 'soil-unknown', detail: 'Ground not confirmed.' }] },
  ...over,
})

describe('GuardianReviewRequest — input contract', () => {
  it('accepts a well-formed request', () => {
    expect(isGuardianReviewRequest(validRequest())).toBe(true)
  })

  it('accepts every validation status', () => {
    for (const status of VALIDATION_STATUSES) {
      expect(isGuardianReviewRequest(validRequest({ validation: { status, findings: [] } }))).toBe(true)
    }
  })

  it('accepts an optional learningProfileId', () => {
    expect(isGuardianReviewRequest(validRequest({ learningProfileId: 'lp_abc' }))).toBe(true)
  })

  it('rejects a missing quoteId or quote snapshot', () => {
    const { quoteId: _q, ...noId } = validRequest()
    void _q
    expect(isGuardianReviewRequest(noId)).toBe(false)
    expect(isGuardianReviewRequest({ ...validRequest(), quote: { trade: 'concreting' } })).toBe(false)
  })

  it('rejects an unknown validation status or non-array findings', () => {
    expect(isGuardianReviewRequest({ ...validRequest(), validation: { status: 'MAYBE', findings: [] } })).toBe(false)
    expect(isGuardianReviewRequest({ ...validRequest(), validation: { status: 'PASS', findings: 'none' } })).toBe(false)
  })

  it('rejects non-objects', () => {
    for (const x of [null, undefined, 7, 'req', []]) {
      expect(isGuardianReviewRequest(x)).toBe(false)
    }
  })
})
