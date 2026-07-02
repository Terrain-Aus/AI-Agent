// HF-SPOIL — pure unit tests. Structured input only: every case is expressed
// through pre-classified review-item kinds; no free text is ever consulted.

import { describe, it, expect } from 'vitest'
import { operatorId } from '../branded'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import { isRemediationFlag } from '../guards'
import type { ReviewItem, ReviewItemKind } from '../review-items'
import type { QuoteReviewRequestShape } from '../review-request'
import { hfSpoil } from '../rules/hfSpoil'

const item = (kind: ReviewItemKind): ReviewItem => ({ kind })

const request = (reviewItems?: ReviewItem[]): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_spoil',
  operatorId: operatorId('op_test'),
  quote: {
    quoteId: 'q_spoil',
    ...(reviewItems !== undefined ? { reviewItems } : {}),
  },
  validation: { status: 'PASS', findings: [] },
})

describe('HF-SPOIL', () => {
  it('fires when excavation is present and spoilDisposal is absent', () => {
    const flags = hfSpoil(request([item('excavation')]), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SPOIL')
  })

  it('is silent when excavation and spoilDisposal are both present', () => {
    const flags = hfSpoil(request([item('excavation'), item('spoilDisposal')]), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toEqual([])
  })

  it('is silent when no excavation item exists', () => {
    const flags = hfSpoil(request([item('other'), item('compactionTesting')]), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toEqual([])
  })

  it('is silent when reviewItems is undefined', () => {
    const flags = hfSpoil(request(undefined), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toEqual([])
  })

  it('is silent when reviewItems is an empty array', () => {
    const flags = hfSpoil(request([]), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toEqual([])
  })

  it('emits exactly one flag even with multiple excavation items', () => {
    const flags = hfSpoil(
      request([item('excavation'), item('excavation'), item('excavation')]),
      DEFAULT_HARD_FLOOR_CONFIG,
    )
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SPOIL')
  })

  it('emits the exact flag: code, severity, category, dismissible and message', () => {
    const flags = hfSpoil(request([item('excavation')]), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toHaveLength(1)
    const flag = flags[0]
    expect(isRemediationFlag(flag)).toBe(true)
    expect(flag.code).toBe('HF-SPOIL')
    expect(flag.severity).toBe('critical')
    expect(flag.category).toBe('spoilDisposal')
    expect(flag.dismissible).toBe(false)
    // spoilDisposal sits on the default hard floor → source is forced.
    expect(flag.source).toBe('hardFloor')
    expect(flag.title).toBe('Spoil disposal not confirmed')
    expect(flag.detail).toBe('Excavation is included, but spoil disposal / cart-away is not confirmed in the quote.')
  })

  it('is pure: same input yields the same output and never mutates the request', () => {
    const req = request([item('excavation')])
    const before = JSON.stringify(req)
    const first = hfSpoil(req, DEFAULT_HARD_FLOOR_CONFIG)
    const second = hfSpoil(req, DEFAULT_HARD_FLOOR_CONFIG)
    expect(second).toEqual(first)
    expect(JSON.stringify(req)).toBe(before)
  })
})
