import { describe, it, expect } from 'vitest'
import type { ReviewFn, ReviewResult } from '../review'
import { createRemediationFlag } from '../remediation-flag'
import { DEFAULT_HARD_FLOOR_CONFIG, createHardFloorConfig } from '../hard-floor'
import { isRemediationFlag } from '../guards'
import { operatorId, reviewedAmount } from '../branded'
import type { QuoteReviewRequestShape } from '../review-request'
import type { LearningProfile } from '../learning'

const request = (): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_123',
  operatorId: operatorId('op_dave'),
  quote: {
    quoteId: 'q_123',
    totals: { subtotalExGst: reviewedAmount(8000), gst: reviewedAmount(800), total: reviewedAmount(8800), marginPct: 18 },
  },
  validation: { status: 'WARN', findings: [] },
})

const profile = (): LearningProfile => ({ operatorId: operatorId('op_dave'), profileVersion: 1, events: [] })

// ─── TEST / REFERENCE ONLY ───────────────────────────────────────────────────
// This no-op ReviewFn is NOT shipped by the package (src ships types/contracts
// only). It exists purely to prove the ReviewFn / ReviewResult contract is
// satisfiable and side-effect-free. It contains no LLM and no deterministic
// remediation logic.
const referenceReview: ReviewFn = async (req, _profile, _config) => {
  void req
  const flag = createRemediationFlag(
    { code: 'spoil-uncosted', category: 'spoilDisposal', severity: 'critical', title: 'Spoil not costed', detail: 'no disposal costed' },
    DEFAULT_HARD_FLOOR_CONFIG,
  )
  const result: ReviewResult = { flags: [flag], profileDelta: { appendEvents: [] } }
  return result
}

describe('ReviewFn / ReviewResult contract', () => {
  it('is async and resolves to exactly { flags, profileDelta }', async () => {
    const result = await referenceReview(request(), profile(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(Object.keys(result).sort()).toEqual(['flags', 'profileDelta'])
    expect(Array.isArray(result.flags)).toBe(true)
    expect(Object.keys(result.profileDelta)).toEqual(['appendEvents'])
  })

  it('emits only well-formed RemediationFlags', async () => {
    const result = await referenceReview(request(), profile(), DEFAULT_HARD_FLOOR_CONFIG)
    for (const f of result.flags) expect(isRemediationFlag(f)).toBe(true)
    // spoilDisposal is on the default hard floor → forced non-dismissible + hardFloor.
    expect(result.flags[0].source).toBe('hardFloor')
    expect(result.flags[0].dismissible).toBe(false)
  })

  it('never mutates its inputs (deep-frozen request / profile / config are safe)', async () => {
    const req = deepFreeze(request())
    const prof = deepFreeze(profile())
    const cfg = deepFreeze(createHardFloorConfig(['spoilDisposal', 'serviceProtection']))
    const before = JSON.stringify({ req, prof, cfg })
    await expect(referenceReview(req, prof, cfg)).resolves.toBeDefined()
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
