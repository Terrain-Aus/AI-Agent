import { describe, it, expect } from 'vitest'
import {
  ACCESS_CONSTRAINTS,
  BYDA_REQUIRED_VALUES,
  BYDA_STATUSES,
  isSiteConditions,
  type SiteConditions,
} from '../site-conditions'

describe('SiteConditions — new M2A input contract (no siteContext existed in M1)', () => {
  it('accepts an empty block (every field optional)', () => {
    expect(isSiteConditions({})).toBe(true)
  })

  it('accepts each field independently', () => {
    for (const access of ACCESS_CONSTRAINTS) expect(isSiteConditions({ access })).toBe(true)
    for (const roadReserveAdjacent of [true, false]) expect(isSiteConditions({ roadReserveAdjacent })).toBe(true)
    for (const wetConditions of [true, false]) expect(isSiteConditions({ wetConditions })).toBe(true)
    for (const bydaRequired of BYDA_REQUIRED_VALUES) expect(isSiteConditions({ bydaRequired })).toBe(true)
    for (const bydaStatus of BYDA_STATUSES) expect(isSiteConditions({ bydaStatus })).toBe(true)
  })

  it('accepts a fully-populated block', () => {
    const full: SiteConditions = {
      access: 'restricted',
      roadReserveAdjacent: true,
      wetConditions: true,
      bydaRequired: true,
      bydaStatus: 'plansReceived',
    }
    expect(isSiteConditions(full)).toBe(true)
  })

  it('distinguishes "no signal" from a positive assertion', () => {
    // Absent field and literal 'unknown' are both valid — and both mean
    // "no signal", never false and never confirmed.
    const noSignal: SiteConditions = {}
    const explicitUnknown: SiteConditions = { bydaRequired: 'unknown', bydaStatus: 'unknown' }
    expect(isSiteConditions(noSignal)).toBe(true)
    expect(isSiteConditions(explicitUnknown)).toBe(true)
    expect(noSignal.bydaRequired).toBeUndefined()
    expect(explicitUnknown.bydaRequired).toBe('unknown')
  })

  it('rejects values outside the closed unions', () => {
    expect(isSiteConditions({ access: 'impossible' })).toBe(false)
    expect(isSiteConditions({ bydaStatus: 'done' })).toBe(false)
    expect(isSiteConditions({ bydaRequired: 'yes' })).toBe(false)
    expect(isSiteConditions({ roadReserveAdjacent: 'yes' })).toBe(false)
    expect(isSiteConditions({ wetConditions: 1 })).toBe(false)
  })

  it('rejects non-objects', () => {
    for (const x of [null, undefined, 5, 'wet', []]) expect(isSiteConditions(x)).toBe(false)
  })
})
