import { describe, it, expect } from 'vitest'
import { REVIEW_ITEM_KINDS, isReviewItem, isReviewItemKind, type ReviewItem } from '../review-items'
import { reviewedAmount } from '../branded'

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({ kind: 'excavation', ...over })

describe('ReviewItem — new M2A input contract (no item concept existed in M1)', () => {
  it('accepts every kind in the closed registry', () => {
    for (const kind of REVIEW_ITEM_KINDS) {
      expect(isReviewItemKind(kind)).toBe(true)
      expect(isReviewItem(item({ kind }))).toBe(true)
    }
  })

  it('carries the BYDA / service-location kinds', () => {
    for (const kind of ['bydaCheck', 'serviceLocation', 'potholing', 'serviceProtection'] as const) {
      expect(REVIEW_ITEM_KINDS).toContain(kind)
    }
  })

  it('accepts optional id, label and amount when well-formed', () => {
    expect(isReviewItem(item({ id: 'li_1', label: 'Bulk dig 200m²', amount: reviewedAmount(4200) }))).toBe(true)
  })

  it('rejects kinds outside the closed registry', () => {
    expect(isReviewItemKind('drainage')).toBe(false)
    expect(isReviewItem({ kind: 'drainage' })).toBe(false)
    expect(isReviewItem({})).toBe(false)
  })

  it('rejects malformed optionals when present', () => {
    expect(isReviewItem({ kind: 'excavation', id: 7 })).toBe(false)
    expect(isReviewItem({ kind: 'excavation', label: [] })).toBe(false)
    expect(isReviewItem({ kind: 'excavation', amount: '4200' })).toBe(false)
  })

  it('rejects non-objects', () => {
    for (const x of [null, undefined, 5, 'excavation', []]) expect(isReviewItem(x)).toBe(false)
  })

  it('classification is structural — the label free text is never the signal', () => {
    // The label CONTRADICTS the kind: the guard (and any rule) must trust `kind`,
    // proving no keyword inference on free text is needed or performed.
    const contradicting = item({ kind: 'other', label: 'excavation and trenching' })
    expect(isReviewItem(contradicting)).toBe(true)
    expect(contradicting.kind).toBe('other')
  })
})
