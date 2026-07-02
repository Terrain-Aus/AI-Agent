import { describe, it, expect } from 'vitest'
import { createNoopGuardian, type ApprenticeGuardian } from '../guardian'
import { isRemediationFlag } from '../guards'
import type { GuardianReviewRequest } from '../review-request'

const request = (): GuardianReviewRequest => ({
  quoteId: 'q_123',
  quote: { quoteId: 'q_123', trade: 'concreting', jobType: 'slab', totals: { total: 9369, marginPct: 22 } },
  validation: { status: 'WARN', findings: [{ severity: 'warn', code: 'soil-unknown', detail: 'Ground not confirmed.' }] },
})

describe('ApprenticeGuardian — contract', () => {
  const guardian: ApprenticeGuardian = createNoopGuardian()

  it('review() resolves to an array', async () => {
    const flags = await guardian.review(request())
    expect(Array.isArray(flags)).toBe(true)
  })

  it('the M1 no-op guardian returns an empty flag list (no remediation logic yet)', async () => {
    const flags = await guardian.review(request())
    expect(flags).toEqual([])
  })

  it('every returned flag (if any) satisfies the RemediationFlag contract', async () => {
    const flags = await guardian.review(request())
    for (const f of flags) expect(isRemediationFlag(f)).toBe(true)
  })

  it('NEVER mutates the incoming request (deep-frozen input is safe)', async () => {
    const req = request()
    deepFreeze(req)
    const before = JSON.stringify(req)
    await expect(guardian.review(req)).resolves.toBeDefined()
    expect(JSON.stringify(req)).toBe(before)
  })

  it('is deterministic for the same input', async () => {
    const req = request()
    const a = await guardian.review(req)
    const b = await guardian.review(req)
    expect(a).toEqual(b)
  })
})

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}
