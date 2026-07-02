// HF-SERVICES — pure unit tests for the single state machine that owns both
// 'HF-SERVICES' and 'HF-SERVICES-NOT-REQUIRED-ASSERTED'. Structured input only.

import { describe, it, expect } from 'vitest'
import { operatorId } from '../branded'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import { isRemediationFlag } from '../guards'
import type { ReviewItem, ReviewItemKind } from '../review-items'
import type { QuoteReviewRequestShape } from '../review-request'
import { BYDA_STATUSES, type BydaRequired, type BydaStatus, type SiteConditions } from '../site-conditions'
import { hfServices } from '../rules/hfServices'

const item = (kind: ReviewItemKind): ReviewItem => ({ kind })

const request = (reviewItems?: ReviewItem[], siteConditions?: SiteConditions): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_services',
  operatorId: operatorId('op_test'),
  quote: {
    quoteId: 'q_services',
    ...(reviewItems !== undefined ? { reviewItems } : {}),
  },
  validation: { status: 'PASS', findings: [] },
  ...(siteConditions !== undefined ? { siteConditions } : {}),
})

const run = (reviewItems?: ReviewItem[], siteConditions?: SiteConditions) =>
  hfServices(request(reviewItems, siteConditions), DEFAULT_HARD_FLOOR_CONFIG)

const EXC = [item('excavation')]

describe('HF-SERVICES — state 3: unconfirmed / critical', () => {
  it('fires critical with excavation, no BYDA fields and no service items', () => {
    const flags = run(EXC)
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SERVICES')
    expect(flags[0].severity).toBe('critical')
  })

  it('fires critical with bydaRequired === true but no status and no service items', () => {
    const flags = run(EXC, { bydaRequired: true })
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SERVICES')
    expect(flags[0].severity).toBe('critical')
  })

  it('fires critical when siteConditions is undefined', () => {
    const flags = run(EXC, undefined)
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SERVICES')
  })

  it('fires critical when siteConditions is an empty object', () => {
    const flags = run(EXC, {})
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SERVICES')
  })

  it('emits the exact critical flag: code, severity, category, dismissible and message', () => {
    const flags = run(EXC)
    expect(flags).toHaveLength(1)
    const flag = flags[0]
    expect(isRemediationFlag(flag)).toBe(true)
    expect(flag.code).toBe('HF-SERVICES')
    expect(flag.severity).toBe('critical')
    expect(flag.category).toBe('serviceProtection')
    expect(flag.dismissible).toBe(false)
    // serviceProtection sits on the default hard floor → source is forced.
    expect(flag.source).toBe('hardFloor')
    expect(flag.title).toBe('BYDA / service location not confirmed')
    expect(flag.detail).toBe(
      'Excavation is included, but the quote does not confirm the BYDA (Before You Dig Australia) / service-location step.',
    )
  })
})

describe('HF-SERVICES — state 1: satisfied / silent', () => {
  it("is silent with bydaStatus 'requested'", () => {
    expect(run(EXC, { bydaStatus: 'requested' })).toEqual([])
  })

  it("is silent with bydaStatus 'plansReceived'", () => {
    expect(run(EXC, { bydaStatus: 'plansReceived' })).toEqual([])
  })

  it("is silent with bydaStatus 'locatedOnSite'", () => {
    expect(run(EXC, { bydaStatus: 'locatedOnSite' })).toEqual([])
  })

  it('is silent with a bydaCheck review item', () => {
    expect(run([...EXC, item('bydaCheck')])).toEqual([])
  })

  it('is silent with a serviceLocation review item', () => {
    expect(run([...EXC, item('serviceLocation')])).toEqual([])
  })

  it('is silent with a potholing review item', () => {
    expect(run([...EXC, item('potholing')])).toEqual([])
  })

  it('is silent with a serviceProtection review item', () => {
    expect(run([...EXC, item('serviceProtection')])).toEqual([])
  })

  it('state 1 wins over a not-required assertion (bydaRequired false + serviceLocation item)', () => {
    expect(run([...EXC, item('serviceLocation')], { bydaRequired: false })).toEqual([])
  })
})

describe('HF-SERVICES — state 2: asserted not required / audit trail', () => {
  it('fires the info flag with bydaRequired === false', () => {
    const flags = run(EXC, { bydaRequired: false })
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SERVICES-NOT-REQUIRED-ASSERTED')
    expect(flags[0].severity).toBe('info')
  })

  it("fires the info flag with bydaStatus === 'notRequired'", () => {
    const flags = run(EXC, { bydaStatus: 'notRequired' })
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SERVICES-NOT-REQUIRED-ASSERTED')
    expect(flags[0].severity).toBe('info')
  })

  it("fires the info flag with bydaRequired === true AND bydaStatus === 'notRequired'", () => {
    const flags = run(EXC, { bydaRequired: true, bydaStatus: 'notRequired' })
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SERVICES-NOT-REQUIRED-ASSERTED')
    expect(flags[0].severity).toBe('info')
  })

  it('emits the exact info flag: code, severity, category, dismissible and message', () => {
    const flags = run(EXC, { bydaRequired: false })
    expect(flags).toHaveLength(1)
    const flag = flags[0]
    expect(isRemediationFlag(flag)).toBe(true)
    expect(flag.code).toBe('HF-SERVICES-NOT-REQUIRED-ASSERTED')
    expect(flag.severity).toBe('info')
    expect(flag.category).toBe('serviceProtection')
    expect(flag.dismissible).toBe(false)
    expect(flag.source).toBe('hardFloor')
    expect(flag.title).toBe('BYDA / service location marked not required')
    expect(flag.detail).toBe(
      'Operator marked BYDA/service-location as not required for this quote. Recorded as the operator’s own call — TerrainPro does not verify it.',
    )
  })
})

describe('HF-SERVICES — gate: no excavation means silence, whatever else is set', () => {
  it('is silent with bydaRequired === false and no excavation', () => {
    expect(run([item('other')], { bydaRequired: false })).toEqual([])
  })

  it("is silent with bydaStatus 'notRequired' and no excavation", () => {
    expect(run([item('spoilDisposal')], { bydaStatus: 'notRequired' })).toEqual([])
  })

  it('is silent with no excavation and no assertion', () => {
    expect(run([item('other')])).toEqual([])
    expect(run([])).toEqual([])
    expect(run(undefined)).toEqual([])
  })

  it("is silent with bydaStatus 'requested' and no excavation", () => {
    expect(run([], { bydaStatus: 'requested' })).toEqual([])
  })
})

describe('HF-SERVICES — robustness and mutual exclusion', () => {
  it('treats an unknown/future bydaStatus as no signal: no throw, falls through to critical', () => {
    const flags = run(EXC, { bydaStatus: 'futureNewStatus' as BydaStatus })
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('HF-SERVICES')
    expect(flags[0].severity).toBe('critical')
  })

  it("treats 'notChecked' and 'unknown' as no signal → critical", () => {
    expect(run(EXC, { bydaStatus: 'notChecked' })[0]?.code).toBe('HF-SERVICES')
    expect(run(EXC, { bydaStatus: 'unknown' })[0]?.code).toBe('HF-SERVICES')
    expect(run(EXC, { bydaRequired: 'unknown' })[0]?.code).toBe('HF-SERVICES')
  })

  it('no input in the state space can produce both HF-SERVICES codes', () => {
    const statuses: Array<BydaStatus | undefined> = [...BYDA_STATUSES, undefined, 'futureNewStatus' as BydaStatus]
    const requireds: Array<BydaRequired | undefined> = [true, false, 'unknown', undefined]
    const itemSets: Array<ReviewItem[] | undefined> = [
      undefined,
      [],
      EXC,
      [...EXC, item('bydaCheck')],
      [...EXC, item('serviceLocation')],
      [...EXC, item('potholing')],
      [...EXC, item('serviceProtection')],
      [...EXC, item('spoilDisposal'), item('other')],
      [item('excavation'), item('excavation')],
      [item('other')],
      [item('bydaCheck')],
    ]

    for (const bydaStatus of statuses) {
      for (const bydaRequired of requireds) {
        for (const items of itemSets) {
          const site: SiteConditions = {
            ...(bydaStatus !== undefined ? { bydaStatus } : {}),
            ...(bydaRequired !== undefined ? { bydaRequired } : {}),
          }
          const flags = run(items, site)
          // At most one flag, ever — the two codes cannot co-emit.
          expect(flags.length).toBeLessThanOrEqual(1)
          const codes = flags.map((f) => f.code)
          expect(codes.includes('HF-SERVICES') && codes.includes('HF-SERVICES-NOT-REQUIRED-ASSERTED')).toBe(false)
        }
      }
    }
  })
})
