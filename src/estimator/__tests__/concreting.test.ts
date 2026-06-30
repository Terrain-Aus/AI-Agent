import { describe, it, expect } from 'vitest'
import { estimate, concretingRawInput } from '../index'
import { BRISBANE_BI, MT_ISA_BI } from '../seed'

const MONEY = ['cost', 'charge', 'price', 'sell', 'rate', 'dollar', '$', 'margin']
const moneyKeys = (o: unknown): string[] => {
  const hits: string[] = []
  if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o)) {
      if (MONEY.some((m) => k.toLowerCase().includes(m))) hits.push(k)
      hits.push(...moneyKeys(v))
    }
  return hits
}

const slab = () => estimate(concretingRawInput({ jobType: 'slab' }), BRISBANE_BI)
const exposedAgg = () =>
  estimate(concretingRawInput({ jobType: 'exposed_aggregate_driveway', finish: 'exposed_aggregate', finishSampleApproved: true }), BRISBANE_BI)
const footings = () =>
  estimate(
    concretingRawInput({
      jobType: 'footings_piers',
      footingLengthM: 40,
      footingWidthMm: 300,
      footingDepthMm: 450,
      pierCount: 6,
      pierDiameterMm: 300,
      pierDepthMm: 900,
      reinforcement: 'N12',
      access: 'open',
    }),
    BRISBANE_BI,
  )
const crossover = () => estimate(concretingRawInput({ jobType: 'crossover', finish: 'broom' }), BRISBANE_BI)

describe('CONCRETING — invariants hold across the new job types', () => {
  it('quantities stay dollar-free for every concreting job type (LAW 1)', () => {
    for (const q of [slab(), exposedAgg(), footings(), crossover()]) {
      expect(moneyKeys(q.quantities)).toEqual([])
    }
  })

  it('every rated line still records a trigger + kind (LAW 7)', () => {
    for (const q of [slab(), exposedAgg(), footings(), crossover()]) {
      for (const l of q.rated!.lines) {
        expect(l.trigger.length).toBeGreaterThan(0)
        expect(['labour', 'plant', 'material', 'subbie', 'fee']).toContain(l.kind)
      }
    }
  })

  it('concrete pump is priced THROUGH the Rate service, not a flat invented fee (LAW 3)', () => {
    const q = estimate(concretingRawInput({ jobType: 'slab', access: 'pump' }), BRISBANE_BI)
    const pump = q.rated!.lines.find((l) => /pump/i.test(l.item))
    expect(pump).toBeDefined()
    expect(pump!.kind).toBe('subbie')
    // hourly 180 × max(3, ceil(12/25)=1 → 3) = 540, lifted to the $650 subbie minimum charge.
    expect(pump!.cost).toBe(650)
    // priced at cost here; Commercial applies the subbie markup later (LAW 5).
    expect(pump!.charge).toBe(pump!.cost)
  })
})

describe('CONCRETING (a) — different job types produce different quantities and hidden costs', () => {
  it('volumes, labour and hidden-cost sets differ by job type', () => {
    const s = slab()
    const e = exposedAgg()
    const f = footings()

    // different physical quantities
    expect(f.quantities.concreteVolumeM3).not.toBe(s.quantities.concreteVolumeM3)
    expect(e.quantities.placeFinishHours).not.toBe(s.quantities.placeFinishHours)
    expect(e.quantities.subBaseTonnes).not.toBe(s.quantities.subBaseTonnes)
    // footings carry reo BAR, slabs carry MESH
    expect(f.quantities.reoBarLm).toBeGreaterThan(0)
    expect(f.quantities.meshSheets).toBe(0)
    expect(s.quantities.meshSheets).toBeGreaterThan(0)

    // different hidden-cost sets
    const items = (q: typeof s) => q.hiddenCosts.map((h) => h.item).join('|')
    expect(items(e)).not.toBe(items(s))
    expect(/seal/i.test(items(e))).toBe(true)
    expect(/seal/i.test(items(s))).toBe(false)
  })
})

describe('CONCRETING (b) — exposed aggregate triggers sealing / washout / finish risk', () => {
  it('adds sealing + washout hidden costs and a finish risk flag', () => {
    const e = exposedAgg()
    const hidden = e.hiddenCosts.map((h) => h.item).join('|')
    expect(/seal/i.test(hidden)).toBe(true)
    expect(/washout/i.test(hidden)).toBe(true)
    expect(e.riskFlags.some((f) => /exposed aggregate/i.test(f))).toBe(true)
  })
})

describe('CONCRETING (c) — council crossover triggers council/permit/traffic/access warnings', () => {
  it('validation surfaces council, permit, traffic and access findings', () => {
    const c = crossover()
    const text = c.validation!.findings.map((f) => f.detail).join(' ').toLowerCase()
    expect(text).toContain('council')
    expect(text).toContain('permit')
    expect(text).toContain('traffic')
    expect(text).toContain('access')
    // and the council/traffic items are actually costed
    const hidden = c.hiddenCosts.map((h) => h.item).join('|')
    expect(/council/i.test(hidden)).toBe(true)
    expect(/traffic/i.test(hidden)).toBe(true)
  })
})

describe('CONCRETING (d) — low-confidence ground/access still BLOCKS send (LAW 6)', () => {
  it('eyeballed access + unconfirmed ground on a Fixed price is not sendable', () => {
    const q = estimate(
      concretingRawInput({
        jobType: 'slab',
        siteVisit: false,
        groundConfirmed: false,
        __sources: { access: { source: 'eyeballed', confidence: 0.4 }, areaM2: { source: 'stated', confidence: 0.6 } },
      }),
      BRISBANE_BI,
    )
    expect(q.confidence!).toBeLessThan(BRISBANE_BI.pricingPolicy.allowFixedPriceBelowConfidence)
    expect(q.validation!.blockSend).toBe(true)
    expect(q.clientQuote!.sendable).toBe(false)
    expect(q.clientQuote!.price).toBeNull()
  })
})

describe('CONCRETING (e) — swapping BI changes dollars but NOT quantities', () => {
  it('Brisbane vs Mt Isa: identical physical quantities, different money', () => {
    const raw = concretingRawInput({ jobType: 'exposed_aggregate_driveway', finish: 'exposed_aggregate', finishSampleApproved: true })
    const bne = estimate(raw, BRISBANE_BI)
    const isa = estimate(raw, MT_ISA_BI)

    // same engine logic → identical quantities
    expect(isa.quantities.concreteVolumeM3).toBe(bne.quantities.concreteVolumeM3)
    expect(isa.quantities.placeFinishHours).toBe(bne.quantities.placeFinishHours)
    expect(isa.quantities.subBaseTonnes).toBe(bne.quantities.subBaseTonnes)
    expect(isa.quantities.meshSheets).toBe(bne.quantities.meshSheets)

    // different BI → different dollars
    expect(isa.internalSheet!.costTotal).not.toBe(bne.internalSheet!.costTotal)
    expect(isa.internalSheet!.sellTotal).not.toBe(bne.internalSheet!.sellTotal)
  })
})
