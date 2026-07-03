// M2C — review-engine hardening invariants. This suite LOCKS the current
// behaviour of the deterministic Apprentice engine; it adds no product
// behaviour and asserts no new semantics. It covers:
//
//   1. Registry completeness — exactly the five deterministic rules.
//   2. Registry uniqueness — no duplicate rule entries, no duplicate
//      RemediationFlag.code ownership across rules.
//   3. Stable output order — engine output always follows registry order
//      (HF-SPOIL, HF-SERVICES, RK-ACCESS, RK-TRAFFIC, RK-WATER).
//   4. Determinism — same structured input → identical RemediationFlag[]
//      across repeated runs.
//   5. No mutation — rule evaluation never mutates the request (deep-frozen
//      inputs run clean).
//   6. Emitted-code ownership — every emitted RemediationFlag.code belongs to
//      a registered deterministic rule, and each rule emits only its own codes.
//   7. Behaviour locks — the exact full flag object each rule emits today.
//   8. Deliberate absences — no RK-COMPACT, no CM-MARGIN, no ruleId/rule_id.
//
// OWNERSHIP: these checks are owned deterministically by the registry. A
// future LLM review pass must NOT duplicate them and must NOT suppress their
// output (see src/rules/index.ts and RULES.md).

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { operatorId } from '../branded'
import { createHardFloorConfig, DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import { isRemediationFlag } from '../guards'
import type { LearningProfile } from '../learning'
import type { RemediationFlag } from '../remediation-flag'
import { deterministicReview } from '../review'
import type { ReviewItem, ReviewItemKind } from '../review-items'
import type { QuoteReviewRequestShape } from '../review-request'
import type { SiteConditions } from '../site-conditions'
import {
  DETERMINISTIC_RULES,
  runDeterministicRules,
  hfServices,
  hfSpoil,
  rkAccess,
  rkTraffic,
  rkWater,
  type DeterministicRule,
} from '../rules'

// ---------------------------------------------------------------------------
// The declared ownership table this suite locks. Registry order IS output
// order. hfServices is one state machine owning two mutually-exclusive codes.
// ---------------------------------------------------------------------------

const REGISTRY_ORDER: ReadonlyArray<{ rule: DeterministicRule; name: string; codes: readonly string[] }> = [
  { rule: hfSpoil, name: 'hfSpoil', codes: ['HF-SPOIL'] },
  { rule: hfServices, name: 'hfServices', codes: ['HF-SERVICES', 'HF-SERVICES-NOT-REQUIRED-ASSERTED'] },
  { rule: rkAccess, name: 'rkAccess', codes: ['RK-ACCESS'] },
  { rule: rkTraffic, name: 'rkTraffic', codes: ['RK-TRAFFIC'] },
  { rule: rkWater, name: 'rkWater', codes: ['RK-WATER'] },
]

const PRIMARY_CODES = ['HF-SPOIL', 'HF-SERVICES', 'RK-ACCESS', 'RK-TRAFFIC', 'RK-WATER'] as const
const ALL_OWNED_CODES = REGISTRY_ORDER.flatMap((entry) => entry.codes)

// ---------------------------------------------------------------------------
// Fixtures: a bounded scenario matrix over the structured-input space.
// ---------------------------------------------------------------------------

const item = (kind: ReviewItemKind): ReviewItem => ({ kind })

const request = (reviewItems?: ReviewItem[], siteConditions?: SiteConditions): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_m2c',
  operatorId: operatorId('op_test'),
  quote: {
    quoteId: 'q_m2c',
    ...(reviewItems !== undefined ? { reviewItems } : {}),
  },
  validation: { status: 'PASS', findings: [] },
  ...(siteConditions !== undefined ? { siteConditions } : {}),
})

const profile = (): LearningProfile => ({ operatorId: operatorId('op_test'), profileVersion: 1, events: [] })

const ITEM_SETS: ReadonlyArray<ReviewItem[] | undefined> = [
  undefined,
  [],
  [item('excavation')],
  [item('excavation'), item('spoilDisposal')],
  [item('excavation'), item('bydaCheck')],
  [item('excavation'), item('spoilDisposal'), item('serviceLocation')],
  [item('excavation'), item('excavation')],
  [item('other'), item('compactionTesting')],
]

const SITE_SETS: ReadonlyArray<SiteConditions | undefined> = [
  undefined,
  {},
  { access: 'restricted' },
  { access: 'open', roadReserveAdjacent: true },
  { wetConditions: true },
  { access: 'restricted', roadReserveAdjacent: true, wetConditions: true },
  { bydaRequired: false },
  { bydaStatus: 'notRequired', wetConditions: true },
  { bydaStatus: 'requested', access: 'restricted' },
  { bydaRequired: 'unknown', bydaStatus: 'unknown' },
]

/** Every (items × site) combination — 80 structured-input scenarios. */
const SCENARIOS: ReadonlyArray<{ items?: ReviewItem[]; site?: SiteConditions }> = ITEM_SETS.flatMap((items) =>
  SITE_SETS.map((site) => ({
    ...(items !== undefined ? { items: items.map((i) => ({ ...i })) } : {}),
    ...(site !== undefined ? { site: { ...site } } : {}),
  })),
)

const scenarioRequest = (s: { items?: ReviewItem[]; site?: SiteConditions }): QuoteReviewRequestShape =>
  request(s.items?.map((i) => ({ ...i })), s.site !== undefined ? { ...s.site } : undefined)

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

// ---------------------------------------------------------------------------
// 1 + 2. Registry completeness and uniqueness
// ---------------------------------------------------------------------------

describe('M2C — registry completeness', () => {
  it('registers exactly five deterministic rules', () => {
    expect(DETERMINISTIC_RULES).toHaveLength(REGISTRY_ORDER.length)
  })

  it('registers exactly the five known rules, by identity, in registry order', () => {
    REGISTRY_ORDER.forEach((entry, i) => {
      expect(DETERMINISTIC_RULES[i]).toBe(entry.rule)
    })
  })

  it('the primary codes are exactly HF-SPOIL, HF-SERVICES, RK-ACCESS, RK-TRAFFIC, RK-WATER', () => {
    expect(REGISTRY_ORDER.map((entry) => entry.codes[0])).toEqual([...PRIMARY_CODES])
  })
})

describe('M2C — registry uniqueness', () => {
  it('contains no duplicate rule entries', () => {
    expect(new Set(DETERMINISTIC_RULES).size).toBe(DETERMINISTIC_RULES.length)
  })

  it('no RemediationFlag.code is owned by more than one rule', () => {
    expect(new Set(ALL_OWNED_CODES).size).toBe(ALL_OWNED_CODES.length)
  })
})

// ---------------------------------------------------------------------------
// 3. Stable output order
// ---------------------------------------------------------------------------

describe('M2C — stable output order', () => {
  it('all five primary codes fire in registry order for the fully-triggering input', () => {
    const flags = runDeterministicRules(
      request([item('excavation')], { access: 'restricted', roadReserveAdjacent: true, wetConditions: true }),
      DEFAULT_HARD_FLOOR_CONFIG,
    )
    expect(flags.map((f) => f.code)).toEqual([...PRIMARY_CODES])
  })

  it('registry order holds for partial subsets (gaps preserved, never reordered)', () => {
    // HF-SPOIL suppressed → HF-SERVICES then RK flags.
    expect(
      runDeterministicRules(
        request([item('excavation'), item('spoilDisposal')], { roadReserveAdjacent: true, wetConditions: true }),
        DEFAULT_HARD_FLOOR_CONFIG,
      ).map((f) => f.code),
    ).toEqual(['HF-SERVICES', 'RK-TRAFFIC', 'RK-WATER'])

    // Both HF rules satisfied → advisory flags only, still in registry order.
    expect(
      runDeterministicRules(
        request([item('excavation'), item('spoilDisposal'), item('bydaCheck')], {
          access: 'restricted',
          wetConditions: true,
        }),
        DEFAULT_HARD_FLOOR_CONFIG,
      ).map((f) => f.code),
    ).toEqual(['RK-ACCESS', 'RK-WATER'])

    // hfServices state 2 code slots into the same registry position.
    expect(
      runDeterministicRules(
        request([item('excavation')], { bydaRequired: false, access: 'restricted' }),
        DEFAULT_HARD_FLOOR_CONFIG,
      ).map((f) => f.code),
    ).toEqual(['HF-SPOIL', 'HF-SERVICES-NOT-REQUIRED-ASSERTED', 'RK-ACCESS'])
  })

  it('for every scenario, engine output equals the per-rule outputs concatenated in registry order', () => {
    for (const scenario of SCENARIOS) {
      const engineFlags = runDeterministicRules(scenarioRequest(scenario), DEFAULT_HARD_FLOOR_CONFIG)
      const concatenated = REGISTRY_ORDER.flatMap((entry) =>
        entry.rule(scenarioRequest(scenario), DEFAULT_HARD_FLOOR_CONFIG),
      )
      expect(engineFlags).toEqual(concatenated)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Determinism — same input → identical output, run after run
// ---------------------------------------------------------------------------

describe('M2C — determinism', () => {
  it('repeated runs over the same request object return deeply identical flags', () => {
    for (const scenario of SCENARIOS) {
      const req = scenarioRequest(scenario)
      const first = runDeterministicRules(req, DEFAULT_HARD_FLOOR_CONFIG)
      for (let run = 0; run < 3; run++) {
        expect(runDeterministicRules(req, DEFAULT_HARD_FLOOR_CONFIG)).toEqual(first)
      }
    }
  })

  it('independently-built but identical requests return deeply identical flags', () => {
    for (const scenario of SCENARIOS) {
      const first = runDeterministicRules(scenarioRequest(scenario), DEFAULT_HARD_FLOOR_CONFIG)
      const second = runDeterministicRules(scenarioRequest(scenario), DEFAULT_HARD_FLOOR_CONFIG)
      expect(second).toEqual(first)
    }
  })

  it('deterministicReview resolves identical results across repeated calls', async () => {
    const req = request([item('excavation')], { access: 'restricted', roadReserveAdjacent: true, wetConditions: true })
    const first = await deterministicReview(req, profile(), DEFAULT_HARD_FLOOR_CONFIG)
    const second = await deterministicReview(req, profile(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(second).toEqual(first)
    expect(first.flags.map((f) => f.code)).toEqual([...PRIMARY_CODES])
  })
})

// ---------------------------------------------------------------------------
// 5. No mutation — deep-frozen inputs run clean through every rule
// ---------------------------------------------------------------------------

describe('M2C — no mutation of the request', () => {
  it('every rule and the engine run clean over a deep-frozen request for every scenario', () => {
    // Strict mode: any write to a frozen object throws, so completing without a
    // throw — plus the serialized-state check — proves no mutation.
    for (const scenario of SCENARIOS) {
      const req = deepFreeze(scenarioRequest(scenario))
      const cfg = deepFreeze(createHardFloorConfig(['spoilDisposal', 'serviceProtection']))
      const before = JSON.stringify({ req, cfg })
      for (const entry of REGISTRY_ORDER) entry.rule(req, cfg)
      runDeterministicRules(req, cfg)
      expect(JSON.stringify({ req, cfg })).toBe(before)
    }
  })

  it('deterministicReview runs clean over deep-frozen request, profile and config', async () => {
    const req = deepFreeze(
      request([item('excavation')], { access: 'restricted', roadReserveAdjacent: true, wetConditions: true }),
    )
    const prof = deepFreeze(profile())
    const cfg = deepFreeze({ categories: ['spoilDisposal', 'serviceProtection'] } as const)
    const before = JSON.stringify({ req, prof, cfg })
    const result = await deterministicReview(req, prof, cfg)
    expect(result.flags.map((f) => f.code)).toEqual([...PRIMARY_CODES])
    expect(JSON.stringify({ req, prof, cfg })).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// 6. Emitted-code ownership
// ---------------------------------------------------------------------------

describe('M2C — emitted-code ownership', () => {
  it('every code the engine emits belongs to a registered deterministic rule', () => {
    for (const scenario of SCENARIOS) {
      for (const flag of runDeterministicRules(scenarioRequest(scenario), DEFAULT_HARD_FLOOR_CONFIG)) {
        expect(ALL_OWNED_CODES).toContain(flag.code)
        expect(isRemediationFlag(flag)).toBe(true)
      }
    }
  })

  it('each rule emits only its own codes, and at most one flag per review', () => {
    for (const scenario of SCENARIOS) {
      for (const entry of REGISTRY_ORDER) {
        const flags = entry.rule(scenarioRequest(scenario), DEFAULT_HARD_FLOOR_CONFIG)
        expect(flags.length).toBeLessThanOrEqual(1)
        for (const flag of flags) {
          expect(entry.codes).toContain(flag.code)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 7. Behaviour locks — the exact full flag each rule emits today. These are
// the current M2B-1 / M2B-2 semantics, asserted verbatim; any change to a
// trigger, suppressor, message, severity, category, dismissible or source is
// a deliberate contract-level edit and must update these locks in the same PR.
// ---------------------------------------------------------------------------

const HF_SPOIL_FLAG: RemediationFlag = {
  code: 'HF-SPOIL',
  category: 'spoilDisposal',
  severity: 'critical',
  source: 'hardFloor',
  dismissible: false,
  title: 'Spoil disposal not confirmed',
  detail: 'Excavation is included, but spoil disposal / cart-away is not confirmed in the quote.',
  suggestedAction:
    'Add a spoil disposal / cart-away allowance, or confirm the quote already covers getting spoil off site.',
}

const HF_SERVICES_FLAG: RemediationFlag = {
  code: 'HF-SERVICES',
  category: 'serviceProtection',
  severity: 'critical',
  source: 'hardFloor',
  dismissible: false,
  title: 'BYDA / service location not confirmed',
  detail:
    'Excavation is included, but the quote does not confirm the BYDA (Before You Dig Australia) / service-location step.',
  suggestedAction:
    'Add a BYDA check or service-location allowance to the quote, or record where the step stands — or mark it as not required — in site conditions.',
}

const HF_SERVICES_NOT_REQUIRED_FLAG: RemediationFlag = {
  code: 'HF-SERVICES-NOT-REQUIRED-ASSERTED',
  category: 'serviceProtection',
  severity: 'info',
  source: 'hardFloor',
  dismissible: false,
  title: 'BYDA / service location marked not required',
  detail:
    'Operator marked BYDA/service-location as not required for this quote. Recorded as the operator’s own call — TerrainPro does not verify it.',
}

const RK_ACCESS_FLAG: RemediationFlag = {
  code: 'RK-ACCESS',
  category: 'siteAccess',
  severity: 'warning',
  source: 'universal',
  dismissible: true,
  title: 'Restricted site access',
  detail: 'Site access is marked restricted, which can affect plant size, float and durations.',
  suggestedAction:
    'Check the quote reflects restricted access — e.g. smaller plant, extra float/handwork, or longer durations.',
}

const RK_TRAFFIC_FLAG: RemediationFlag = {
  code: 'RK-TRAFFIC',
  category: 'trafficManagement',
  severity: 'warning',
  source: 'universal',
  dismissible: true,
  title: 'Works adjacent to a road reserve',
  detail: 'Works are marked adjacent to a road reserve, footpath or verge, which can require traffic management.',
  suggestedAction:
    'Check the quote allows for traffic management and any road-reserve / footpath permits or approvals.',
}

const RK_WATER_FLAG: RemediationFlag = {
  code: 'RK-WATER',
  category: 'dewatering',
  severity: 'warning',
  source: 'universal',
  dismissible: true,
  title: 'Wet ground / high water table',
  detail: 'Wet conditions are marked, which can require dewatering, pumping or a wet-weather allowance.',
  suggestedAction: 'Check the quote allows for dewatering / pumping or a wet-conditions allowance as needed.',
}

describe('M2C — behaviour locks (exact full flag objects)', () => {
  it('HF-SPOIL: excavation without spoilDisposal emits exactly the locked flag', () => {
    expect(hfSpoil(request([item('excavation')]), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([HF_SPOIL_FLAG])
  })

  it('HF-SPOIL: silent when suppressed, ungated, or without structured items', () => {
    expect(hfSpoil(request([item('excavation'), item('spoilDisposal')]), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(hfSpoil(request([item('other')]), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(hfSpoil(request([]), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(hfSpoil(request(undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('HF-SERVICES: excavation with no BYDA signal emits exactly the locked critical flag', () => {
    expect(hfServices(request([item('excavation')]), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([HF_SERVICES_FLAG])
    expect(hfServices(request([item('excavation')], {}), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([HF_SERVICES_FLAG])
    expect(
      hfServices(request([item('excavation')], { bydaRequired: 'unknown', bydaStatus: 'unknown' }), DEFAULT_HARD_FLOOR_CONFIG),
    ).toEqual([HF_SERVICES_FLAG])
  })

  it('HF-SERVICES: not-required assertion emits exactly the locked info flag', () => {
    expect(hfServices(request([item('excavation')], { bydaRequired: false }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([
      HF_SERVICES_NOT_REQUIRED_FLAG,
    ])
    expect(
      hfServices(request([item('excavation')], { bydaStatus: 'notRequired' }), DEFAULT_HARD_FLOOR_CONFIG),
    ).toEqual([HF_SERVICES_NOT_REQUIRED_FLAG])
  })

  it('HF-SERVICES: silent when satisfied or ungated', () => {
    expect(
      hfServices(request([item('excavation')], { bydaStatus: 'requested' }), DEFAULT_HARD_FLOOR_CONFIG),
    ).toEqual([])
    expect(hfServices(request([item('excavation'), item('bydaCheck')]), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(hfServices(request([item('other')], { bydaRequired: false }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(hfServices(request(undefined, undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('RK-ACCESS: restricted access emits exactly the locked advisory flag; otherwise silent', () => {
    expect(rkAccess(request(undefined, { access: 'restricted' }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([RK_ACCESS_FLAG])
    expect(rkAccess(request(undefined, { access: 'open' }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkAccess(request(undefined, { access: 'moderate' }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkAccess(request(undefined, {}), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkAccess(request(undefined, undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('RK-TRAFFIC: roadReserveAdjacent === true emits exactly the locked advisory flag; otherwise silent', () => {
    expect(rkTraffic(request(undefined, { roadReserveAdjacent: true }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([
      RK_TRAFFIC_FLAG,
    ])
    expect(rkTraffic(request(undefined, { roadReserveAdjacent: false }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkTraffic(request(undefined, {}), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkTraffic(request(undefined, undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('RK-WATER: wetConditions === true emits exactly the locked advisory flag; otherwise silent', () => {
    expect(rkWater(request(undefined, { wetConditions: true }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([RK_WATER_FLAG])
    expect(rkWater(request(undefined, { wetConditions: false }), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkWater(request(undefined, {}), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    expect(rkWater(request(undefined, undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })

  it('the fully-triggering input emits exactly the five locked flags, in registry order', () => {
    expect(
      runDeterministicRules(
        request([item('excavation')], { access: 'restricted', roadReserveAdjacent: true, wetConditions: true }),
        DEFAULT_HARD_FLOOR_CONFIG,
      ),
    ).toEqual([HF_SPOIL_FLAG, HF_SERVICES_FLAG, RK_ACCESS_FLAG, RK_TRAFFIC_FLAG, RK_WATER_FLAG])
  })

  it('emitted flags carry exactly the RemediationFlag keys — no ruleId, no extras', () => {
    const BASE_KEYS = ['category', 'code', 'detail', 'dismissible', 'severity', 'source', 'title']
    const WITH_ACTION = [...BASE_KEYS, 'suggestedAction'].sort()
    for (const scenario of SCENARIOS) {
      for (const flag of runDeterministicRules(scenarioRequest(scenario), DEFAULT_HARD_FLOOR_CONFIG)) {
        const keys = Object.keys(flag).sort()
        expect([BASE_KEYS.join(','), WITH_ACTION.join(',')]).toContain(keys.join(','))
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 8. Empty / undefined structured input, and deliberate absences
// ---------------------------------------------------------------------------

describe('M2C — empty and undefined structured input', () => {
  it('an M1-shaped request (no reviewItems, no siteConditions) yields no flags', async () => {
    expect(runDeterministicRules(request(undefined, undefined), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
    const result = await deterministicReview(request(undefined, undefined), profile(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(result.flags).toEqual([])
    expect(result.profileDelta).toEqual({ appendEvents: [] })
  })

  it('empty structured blocks ([] items, {} site) yield no flags', () => {
    expect(runDeterministicRules(request([], {}), DEFAULT_HARD_FLOOR_CONFIG)).toEqual([])
  })
})

describe('M2C — deliberate absences stay absent', () => {
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..') // apprentice-service/src

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...walk(p))
      else if (p.endsWith('.ts')) out.push(p)
    }
    return out
  }

  const nonTestSources = walk(srcDir).filter((p) => !p.includes('__tests__'))

  it('no scenario ever emits RK-COMPACT or CM-MARGIN', () => {
    for (const scenario of SCENARIOS) {
      const codes = runDeterministicRules(scenarioRequest(scenario), DEFAULT_HARD_FLOOR_CONFIG).map((f) => f.code)
      expect(codes).not.toContain('RK-COMPACT')
      expect(codes).not.toContain('CM-MARGIN')
    }
  })

  it('the registry owns neither RK-COMPACT nor CM-MARGIN', () => {
    expect(ALL_OWNED_CODES).not.toContain('RK-COMPACT')
    expect(ALL_OWNED_CODES).not.toContain('CM-MARGIN')
  })

  it('no non-test source implements an RK-COMPACT or CM-MARGIN code literal', () => {
    const offenders = nonTestSources.filter((file) =>
      /['"](RK-COMPACT|CM-MARGIN)['"]/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  it('no non-test source introduces a ruleId / rule_id identifier', () => {
    const offenders = nonTestSources.filter((file) => /\bruleId\b|\brule_id\b/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
