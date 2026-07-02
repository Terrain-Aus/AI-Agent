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

describe('QuoteReviewRequest — M2A additive blocks (backward compatible)', () => {
  it('an M1-shaped request (no reviewItems, no siteConditions) still passes', () => {
    const m1 = request()
    expect(m1.quote.reviewItems).toBeUndefined()
    expect(m1.siteConditions).toBeUndefined()
    expect(isQuoteReviewRequest(m1)).toBe(true)
  })

  it('accepts structured reviewItems when present', () => {
    const r = request({
      quote: {
        quoteId: 'q_123',
        reviewItems: [
          { kind: 'excavation', label: 'Trench 40lm' },
          { kind: 'spoilDisposal', amount: reviewedAmount(950) },
          { kind: 'bydaCheck' },
          { kind: 'potholing', id: 'li_7' },
        ],
      },
    })
    expect(isQuoteReviewRequest(r)).toBe(true)
  })

  it('an empty reviewItems array is valid and distinct from undefined', () => {
    expect(isQuoteReviewRequest(request({ quote: { quoteId: 'q_123', reviewItems: [] } }))).toBe(true)
  })

  it('accepts structured siteConditions when present', () => {
    const r = request({
      siteConditions: { access: 'restricted', roadReserveAdjacent: true, wetConditions: false, bydaRequired: true, bydaStatus: 'requested' },
    })
    expect(isQuoteReviewRequest(r)).toBe(true)
  })

  it('rejects malformed reviewItems / siteConditions when present', () => {
    expect(isQuoteReviewRequest({ ...request(), quote: { quoteId: 'q_123', reviewItems: 'dig' } })).toBe(false)
    expect(isQuoteReviewRequest({ ...request(), quote: { quoteId: 'q_123', reviewItems: [{ kind: 'drainage' }] } })).toBe(false)
    expect(isQuoteReviewRequest({ ...request(), siteConditions: { bydaStatus: 'done' } })).toBe(false)
    expect(isQuoteReviewRequest({ ...request(), siteConditions: 'wet' })).toBe(false)
  })

  it('the structured signal never depends on free text', () => {
    // scopeNote free text contradicts the structured data: the contract carries
    // the signal in `kind`/`bydaStatus`, so no keyword inference is ever needed.
    const r = request({
      quote: {
        quoteId: 'q_123',
        scopeNote: 'no digging on this job',
        reviewItems: [{ kind: 'excavation', label: 'landscaping only' }],
      },
      siteConditions: { bydaStatus: 'plansReceived' },
    })
    expect(isQuoteReviewRequest(r)).toBe(true)
    expect(r.quote.reviewItems?.[0]?.kind).toBe('excavation')
    expect(r.siteConditions?.bydaStatus).toBe('plansReceived')
  })
})
