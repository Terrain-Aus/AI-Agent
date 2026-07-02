// RK-ACCESS / RK-TRAFFIC / RK-WATER — pure unit tests for the M2B-2 advisory
// site-risk rules. Structured input only: every case is expressed through a
// single `siteConditions` field; no free text and no review items are consulted.
//
// Shared contract for all three: fired by exactly ONE positive assertion;
// silent on absence and on the "no signal" values; advisory (dismissible
// 'warning', source 'universal') because their categories are NOT on the
// default hard floor.

import { describe, it, expect } from 'vitest'
import { operatorId } from '../branded'
import { createHardFloorConfig, DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import { isRemediationFlag } from '../guards'
import type { QuoteReviewRequestShape } from '../review-request'
import type { SiteConditions } from '../site-conditions'
import { rkAccess } from '../rules/rkAccess'
import { rkTraffic } from '../rules/rkTraffic'
import { rkWater } from '../rules/rkWater'

const request = (siteConditions?: SiteConditions): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_rk',
  operatorId: operatorId('op_test'),
  quote: { quoteId: 'q_rk' },
  validation: { status: 'PASS', findings: [] },
  ...(siteConditions !== undefined ? { siteConditions } : {}),
})

describe('RK-ACCESS', () => {
  it('fires when access is restricted', () => {
    const flags = rkAccess(request({ access: 'restricted' }), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('RK-ACCESS')
  })

  it('is silent for open / moderate access', () => {
    expect(rkAccess(request({ access: 'open' }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkAccess(request({ access: 'moderate' }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('is silent when access is absent, siteConditions is empty, or siteConditions is absent', () => {
    expect(rkAccess(request({ roadReserveAdjacent: true }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkAccess(request({}), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkAccess(request(undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('emits the exact advisory flag: code, severity, category, dismissible, source, message', () => {
    const flag = rkAccess(request({ access: 'restricted' }), DEFAULT_HARD_FLOOR_CONFIG)[0]
    expect(isRemediationFlag(flag)).toBe(true)
    expect(flag.code).toBe('RK-ACCESS')
    expect(flag.severity).toBe('warning')
    expect(flag.category).toBe('siteAccess')
    // siteAccess is NOT on the default hard floor → advisory, dismissible, universal.
    expect(flag.dismissible).toBe(true)
    expect(flag.source).toBe('universal')
    expect(flag.title).toBe('Restricted site access')
  })

  it('is forced non-dismissible / hardFloor when the deployment puts siteAccess on the hard floor', () => {
    const cfg = createHardFloorConfig(['siteAccess'])
    const flag = rkAccess(request({ access: 'restricted' }), cfg)[0]
    expect(flag.dismissible).toBe(false)
    expect(flag.source).toBe('hardFloor')
  })
})

describe('RK-TRAFFIC', () => {
  it('fires when roadReserveAdjacent is true', () => {
    const flags = rkTraffic(request({ roadReserveAdjacent: true }), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('RK-TRAFFIC')
  })

  it('is silent when roadReserveAdjacent is false, absent, or siteConditions is absent', () => {
    expect(rkTraffic(request({ roadReserveAdjacent: false }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkTraffic(request({ access: 'restricted' }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkTraffic(request(undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('emits the exact advisory flag', () => {
    const flag = rkTraffic(request({ roadReserveAdjacent: true }), DEFAULT_HARD_FLOOR_CONFIG)[0]
    expect(isRemediationFlag(flag)).toBe(true)
    expect(flag.code).toBe('RK-TRAFFIC')
    expect(flag.severity).toBe('warning')
    expect(flag.category).toBe('trafficManagement')
    expect(flag.dismissible).toBe(true)
    expect(flag.source).toBe('universal')
    expect(flag.title).toBe('Works adjacent to a road reserve')
  })
})

describe('RK-WATER', () => {
  it('fires when wetConditions is true', () => {
    const flags = rkWater(request({ wetConditions: true }), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flags).toHaveLength(1)
    expect(flags[0].code).toBe('RK-WATER')
  })

  it('is silent when wetConditions is false, absent, or siteConditions is absent', () => {
    expect(rkWater(request({ wetConditions: false }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkWater(request({ access: 'restricted' }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkWater(request(undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('emits the exact advisory flag', () => {
    const flag = rkWater(request({ wetConditions: true }), DEFAULT_HARD_FLOOR_CONFIG)[0]
    expect(isRemediationFlag(flag)).toBe(true)
    expect(flag.code).toBe('RK-WATER')
    expect(flag.severity).toBe('warning')
    expect(flag.category).toBe('dewatering')
    expect(flag.dismissible).toBe(true)
    expect(flag.source).toBe('universal')
    expect(flag.title).toBe('Wet ground / high water table')
  })
})

describe('RK rules — purity', () => {
  it('are pure: same input yields the same output and never mutate the request', () => {
    const site: SiteConditions = { access: 'restricted', roadReserveAdjacent: true, wetConditions: true }
    for (const rule of [rkAccess, rkTraffic, rkWater]) {
      const req = request(site)
      const before = JSON.stringify(req)
      const first = rule(req, DEFAULT_HARD_FLOOR_CONFIG)
      const second = rule(req, DEFAULT_HARD_FLOOR_CONFIG)
      expect(second).toEqual(first)
      expect(JSON.stringify(req)).toBe(before)
    }
  })
})
