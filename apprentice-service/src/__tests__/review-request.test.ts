import { describe, it, expect } from 'vitest'
import { VALIDATION_STATUSES, type QuoteReviewRequestShape } from '../review-request'
import { isQuoteReviewRequest, isGuardianReviewRequest } from '../guards'
import { operatorId, reviewedAmount } from '../branded'

const request = (over: Partial<QuoteReviewRequestShape> = {}): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_123',
  operatorId: operatorId('op_dave'),
  quote: {
    quoteId: 'q_123',
    trade: 'earthworks',
    jobType: 'excavation',
    totals: { subtotalExGst: reviewedAmount(8000), gst: reviewedAmount(800), total: reviewedAmount(8800), marginPct: 18 },
    scopeNote: 'bulk dig 200m²',
  },
  validation: { status: 'WARN', findings: [{ severity: 'warn', code: 'spoil-unpriced', detail: 'no disposal' }] },
  ...over,
})

describe('QuoteReviewRequest — input contract', () => {
  it('accepts a well-formed, version-1 request', () => {
    expect(isQuoteReviewRequest(request())).toBe(true)
  })

  it('exposes the same guard under both names', () => {
    expect(isQuoteReviewRequest).toBe(isGuardianReviewRequest)
  })

  it('requires reviewContractVersion === 1', () => {
    expect(isQuoteReviewRequest({ ...request(), reviewContractVersion: 2 })).toBe(false)
    const { reviewContractVersion: _v, ...noVersion } = request()
    void _v
    expect(isQuoteReviewRequest(noVersion)).toBe(false)
  })

  it('accepts every validation status', () => {
    for (const status of VALIDATION_STATUSES) {
      expect(isQuoteReviewRequest(request({ validation: { status, findings: [] } }))).toBe(true)
    }
  })

  it('rejects missing ids, bad status, or non-array findings', () => {
    const { quoteId: _q, ...noId } = request()
    void _q
    expect(isQuoteReviewRequest(noId)).toBe(false)
    expect(isQuoteReviewRequest({ ...request(), validation: { status: 'MAYBE', findings: [] } })).toBe(false)
    expect(isQuoteReviewRequest({ ...request(), validation: { status: 'PASS', findings: 'none' } })).toBe(false)
  })

  it('rejects non-objects', () => {
    for (const x of [null, undefined, 5, 'req', []]) expect(isQuoteReviewRequest(x)).toBe(false)
  })
})
