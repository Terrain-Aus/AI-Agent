// Engine-level tests: the deterministic rule registry and its wiring into the
// review entry point (deterministicReview). Registry order is output order.

import { describe, it, expect } from 'vitest'
import { operatorId } from '../branded'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import { isRemediationFlag } from '../guards'
import type { LearningProfile } from '../learning'
import { deterministicReview } from '../review'
import type { ReviewItem, ReviewItemKind } from '../review-items'
import type { QuoteReviewRequestShape } from '../review-request'
import type { SiteConditions } from '../site-conditions'
import { DETERMINISTIC_RULES, runDeterministicRules, hfServices, hfSpoil, rkAccess, rkTraffic, rkWater } from '../rules'

const item = (kind: ReviewItemKind): ReviewItem => ({ kind })

const request = (reviewItems?: ReviewItem[], siteConditions?: SiteConditions): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_engine',
  operatorId: operatorId('op_test'),
  quote: {
    quoteId: 'q_engine',
    ...(reviewItems !== undefined ? { reviewItems } : {}),
  },
  validation: { status: 'PASS', findings: [] },
  ...(siteConditions !== undefined ? { siteConditions } : {}),
})

const profile = (): LearningProfile => ({ operatorId: operatorId('op_test'), profileVersion: 1, events: [] })

describe('deterministic rule registry', () => {
  it('registers the hard-floor then advisory rules, in that exact order', () => {
    expect(DETERMINISTIC_RULES).toHaveLength(5)
    expect(DETERMINISTIC_RULES[0]).toBe(hfSpoil)
    expect(DETERMINISTIC_RULES[1]).toBe(hfServices)
    expect(DETERMINISTIC_RULES[2]).toBe(rkAccess)
    expect(DETERMINISTIC_RULES[3]).toBe(rkTraffic)
    expect(DETERMINISTIC_RULES[4]).toBe(rkWater)
  })

  it('returns two flags in registry order when one input triggers both hard-floor rules', () => {
    // A bare excavation item: spoil unconfirmed AND BYDA/service-location unconfirmed.
    const flags = runDeterministicRules(request([item('excavation')]), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags.map((f) => f.code)).toEqual(['HF-SPOIL', 'HF-SERVICES'])
    for (const flag of flags) expect(isRemediationFlag(flag)).toBe(true)
  })

  it('emits hard-floor flags before advisory site-risk flags, in registry order', () => {
    // Excavation with no allowances triggers both HF rules; a fully-asserted
    // site-conditions block triggers all three RK rules.
    const flags = runDeterministicRules(
      request([item('excavation')], { access: 'restricted', roadReserveAdjacent: true, wetConditions: true }),
      DEFAULT_HARD_FLOOR_CONFIG,
    )
    expect(flags.map((f) => f.code)).toEqual(['HF-SPOIL', 'HF-SERVICES', 'RK-ACCESS', 'RK-TRAFFIC', 'RK-WATER'])
    for (const flag of flags) expect(isRemediationFlag(flag)).toBe(true)
  })

  it('runs advisory rules independently of excavation (no reviewItems)', () => {
    // RK rules read siteConditions only — they are not gated on an excavation item.
    const flags = runDeterministicRules(
      request(undefined, { access: 'restricted', roadReserveAdjacent: true, wetConditions: true }),
      DEFAULT_HARD_FLOOR_CONFIG,
    )
    expect(flags.map((f) => f.code)).toEqual(['RK-ACCESS', 'RK-TRAFFIC', 'RK-WATER'])
  })

  it('returns [] for empty or undefined structured inputs', () => {
    expect(runDeterministicRules(request(undefined, undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(runDeterministicRules(request([], {}), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('output order is stable (snapshot)', () => {
    const flags = runDeterministicRules(request([item('excavation')]), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toMatchSnapshot()
    // Determinism: a second run over the same input is identical.
    expect(runDeterministicRules(request([item('excavation')]), DEFAULT_HARD_FLOOR_CONFIG)).toEqual(flags)
  })
})

describe('deterministicReview — ReviewFn wiring', () => {
  it('satisfies the ReviewFn contract and carries the registry output in order', async () => {
    const result = await deterministicReview(request([item('excavation')]), profile(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(Object.keys(result).sort()).toEqual(['flags', 'profileDelta'])
    expect(result.flags.map((f) => f.code)).toEqual(['HF-SPOIL', 'HF-SERVICES'])
    // No learning in M2B-1: the delta is always empty.
    expect(result.profileDelta).toEqual({ appendEvents: [] })
  })

  it('resolves to no flags for an M1-shaped request with no structured input', async () => {
    const result = await deterministicReview(request(), profile(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(result.flags).toEqual([])
  })

  it('never mutates its inputs (deep-frozen request / profile / config are safe)', async () => {
    const req = deepFreeze(request([item('excavation')], { bydaRequired: true }))
    const prof = deepFreeze(profile())
    const cfg = deepFreeze({ categories: ['spoilDisposal', 'serviceProtection'] } as const)
    const before = JSON.stringify({ req, prof, cfg })
    await expect(deterministicReview(req, prof, cfg)).resolves.toBeDefined()
    expect(JSON.stringify({ req, prof, cfg })).toBe(before)
  })
})

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}
