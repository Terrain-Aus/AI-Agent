import { describe, it, expect } from 'vitest'
import { foremanReview } from '../foreman'
import { estimate } from '../estimator'
import type { CostCategory, Estimate, JobSpec, LineItem } from '../types'

/* ── deterministic fixtures (Foreman is pure: spec + est → verdict) ── */

const baseSpec = (over: Partial<JobSpec> = {}): JobSpec => ({
  trade: 'concreting',
  jobType: 'slab',
  finish: 'plain',
  area: 30,
  thicknessMm: 100,
  location: 'Brisbane',
  excavationDepthMm: 0,
  soil: 'clay',
  access: 'easy',
  prepRequired: false,
  boxingRequired: false,
  reinforcement: false,
  pumpRequired: false,
  rawDescription: '',
  notes: '',
  ...over,
})

const li = (label: string, total: number): LineItem => ({ label, detail: '', qty: 1, unit: 'item', rate: total, total })
const cat = (key: CostCategory['key'], items: LineItem[]): CostCategory => ({ key, title: key, items, subtotal: items.reduce((s, i) => s + i.total, 0) })

// A clean, complete estimate: labour + materials (with concrete supply), healthy
// margin, GST present, small total, good confidence → nothing for Foreman to flag.
const baseEst = (over: Partial<Estimate> = {}): Estimate => ({
  categories: over.categories ?? [
    cat('materials', [li('Concrete supply', 3600), li('Sundries', 72)]),
    cat('labour', [li('Lay & finish', 900)]),
  ],
  baseCost: 4572,
  hiddenCosts: [],
  contingency: 0,
  marginPct: 22,
  marginAmount: 1006,
  subtotalExGst: 4000,
  gst: 400,
  expected: 4400,
  low: 4000,
  high: 4800,
  summary: '',
  confidence: 80,
  ...over,
})

const codes = (r: ReturnType<typeof foremanReview>) => r.findings.map((x) => x.code)

describe('FOREMAN — clean quote', () => {
  it('a complete, costed, healthy-margin quote is READY and exportable', () => {
    const r = foremanReview(baseSpec(), baseEst())
    expect(r.status).toBe('READY')
    expect(r.exportAllowed).toBe(true)
    expect(r.blockers).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
    expect(r.summary.toLowerCase()).toContain('safe to export')
  })
})

describe('FOREMAN — BLOCK rules (each gates export)', () => {
  it('no labour costed → BLOCK', () => {
    const r = foremanReview(baseSpec(), baseEst({ categories: [cat('materials', [li('Concrete supply', 3600)])] }))
    expect(r.status).toBe('BLOCK')
    expect(r.exportAllowed).toBe(false)
    expect(codes(r)).toContain('no-labour')
  })

  it('materials-consuming job with no materials → BLOCK', () => {
    const r = foremanReview(baseSpec(), baseEst({ categories: [cat('labour', [li('Lay & finish', 900)])] }))
    expect(r.status).toBe('BLOCK')
    expect(codes(r)).toContain('no-materials')
  })

  it('concrete job with materials but no concrete supply line → BLOCK', () => {
    const r = foremanReview(
      baseSpec(),
      baseEst({ categories: [cat('materials', [li('Reinforcing mesh', 300)]), cat('labour', [li('Lay & finish', 900)])] }),
    )
    expect(codes(r)).toContain('no-concrete-supply')
    expect(r.status).toBe('BLOCK')
  })

  it('excavation job with no disposal costed → BLOCK', () => {
    const r = foremanReview(
      baseSpec({ jobType: 'excavation', trade: 'earthworks', excavationDepthMm: 300 }),
      baseEst({ categories: [cat('labour', [li('Operator', 900)]), cat('machinery', [li('Excavator', 1200)])] }),
    )
    expect(codes(r)).toContain('no-disposal')
    expect(r.status).toBe('BLOCK')
  })

  it('pump required but no plant costed → BLOCK', () => {
    const r = foremanReview(
      baseSpec({ pumpRequired: true }),
      baseEst({ categories: [cat('materials', [li('Concrete supply', 3600)]), cat('labour', [li('Lay & finish', 900)])] }),
    )
    expect(codes(r)).toContain('no-plant')
  })

  it('zero/negative margin → BLOCK (not even covering overheads)', () => {
    const r = foremanReview(baseSpec(), baseEst({ marginPct: 0 }))
    expect(codes(r)).toContain('no-margin')
    expect(r.status).toBe('BLOCK')
  })

  it('client-ready total with no GST → BLOCK', () => {
    const r = foremanReview(baseSpec(), baseEst({ gst: 0 }))
    expect(codes(r)).toContain('no-gst')
  })

  it('missing measurements (no area / no thickness) → BLOCK', () => {
    expect(codes(foremanReview(baseSpec({ area: 0 }), baseEst()))).toContain('no-area')
    expect(codes(foremanReview(baseSpec({ thicknessMm: 0 }), baseEst()))).toContain('no-thickness')
  })

  it('a BLOCK never allows export', () => {
    const r = foremanReview(baseSpec({ area: 0 }), baseEst())
    expect(r.exportAllowed).toBe(false)
    expect(r.nextAction.toLowerCase()).toContain('fix')
  })
})

describe('FOREMAN — WARN rules (review, but still exportable)', () => {
  it('thin margin warns but does not block', () => {
    const r = foremanReview(baseSpec(), baseEst({ marginPct: 12 }))
    expect(r.status).toBe('WARN')
    expect(r.exportAllowed).toBe(true)
    expect(codes(r)).toContain('low-margin')
  })

  it('margin below the overhead floor warns', () => {
    expect(codes(foremanReview(baseSpec(), baseEst({ marginPct: 6 })))).toContain('overhead-recovery')
  })

  it('large quote prompts a deposit', () => {
    const r = foremanReview(baseSpec(), baseEst({ expected: 24000 }))
    expect(codes(r)).toContain('no-deposit')
  })

  it('risky assumptions: unknown ground, hard access without pump, low confidence', () => {
    const r = foremanReview(baseSpec({ soil: 'unknown', access: 'difficult' }), baseEst({ confidence: 40 }))
    expect(codes(r)).toEqual(expect.arrayContaining(['ground-unconfirmed', 'access-no-pump', 'low-confidence']))
    expect(r.status).toBe('WARN')
  })

  it('unconfirmed location warns', () => {
    expect(codes(foremanReview(baseSpec({ location: '' }), baseEst()))).toContain('location-unconfirmed')
  })
})

describe('FOREMAN — aggregation & contract', () => {
  it('blockers sort ahead of warnings; status follows the worst finding', () => {
    const r = foremanReview(baseSpec({ soil: 'unknown' }), baseEst({ categories: [cat('materials', [li('Concrete supply', 3600)])], marginPct: 12 }))
    expect(r.status).toBe('BLOCK')
    expect(r.findings[0].severity).toBe('block')
    expect(r.blockers.length).toBeGreaterThan(0)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('never invents money and never mutates its inputs', () => {
    const spec = baseSpec()
    const est = baseEst()
    const snap = JSON.stringify({ spec, est })
    foremanReview(spec, est)
    expect(JSON.stringify({ spec, est })).toBe(snap)
  })
})

describe('FOREMAN — integration with the real estimator', () => {
  it('a real estimated driveway is structurally complete (no missing-cost blockers)', () => {
    const spec = baseSpec({ jobType: 'driveway', area: 60, thicknessMm: 125, location: 'Brisbane', prepRequired: true, boxingRequired: true })
    const r = foremanReview(spec, estimate(spec))
    // estimator produces labour, materials (incl concrete supply), machinery & disposal,
    // so none of the "missing cost" blockers should fire.
    const missingCost = ['no-labour', 'no-materials', 'no-concrete-supply', 'no-plant', 'no-disposal']
    expect(r.blockers.map((b) => b.code).filter((c) => missingCost.includes(c))).toHaveLength(0)
  })

  it("the estimator's excavation-with-no-depth path leaves spoil uncosted → Foreman catches it", () => {
    // jobType excavation with no dig depth: estimator adds a machine but no disposal.
    const spec = baseSpec({ jobType: 'excavation', trade: 'earthworks', area: 200, thicknessMm: 0, excavationDepthMm: 0, prepRequired: false })
    const r = foremanReview(spec, estimate(spec))
    expect(r.findings.map((x) => x.code)).toContain('no-disposal')
  })
})
