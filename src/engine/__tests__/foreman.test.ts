import { describe, it, expect } from 'vitest'
import { foremanReview, DEPOSIT_THRESHOLD, type ForemanContext } from '../foreman'
import { estimate } from '../estimator'
import { buildSpec } from '../apprentice'
import type { CostCategory, Estimate, JobSpec, LineItem } from '../types'

/* ── builders ─────────────────────────────────────────────────── */

const spec = (over: Partial<JobSpec> = {}): JobSpec => buildSpec(over)

const li = (label: string, total = 100): LineItem => ({ label, detail: '', qty: 1, unit: 'item', rate: total, total })

const cat = (key: CostCategory['key'], items: LineItem[]): CostCategory => ({
  key,
  title: key,
  items,
  subtotal: items.reduce((s, i) => s + i.total, 0),
})

/** A minimal, internally-complete estimate; override pieces to break it. */
const makeEstimate = (over: Partial<Estimate> = {}): Estimate => ({
  categories: [
    cat('materials', [li('Concrete supply', 1300)]),
    cat('labour', [li('Lay & finish', 2400)]),
  ],
  baseCost: 3700,
  hiddenCosts: [],
  contingency: 0,
  marginPct: 22,
  marginAmount: 814,
  subtotalExGst: 4514,
  gst: 451,
  expected: 4965,
  low: 4500,
  high: 5400,
  summary: '',
  confidence: 85,
  ...over,
})

const CLEAN_CTX: ForemanContext = { businessConfigured: true }

/* ── a genuinely clean quote ──────────────────────────────────── */

describe('Foreman — READY path', () => {
  it('passes a complete, well-formed quote', () => {
    const s = spec({ jobType: 'slab', area: 40, thicknessMm: 100, soil: 'clay', location: 'Brisbane', prepRequired: true, reinforcement: true, access: 'easy', rawDescription: '40m² slab in Brisbane' })
    const est = estimate(s)
    const r = foremanReview({ spec: s, estimate: est }, CLEAN_CTX)
    expect(r.status).toBe('READY')
    expect(r.canExport).toBe(true)
    expect(r.blockers).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })
})

/* ── structural BLOCK checks ──────────────────────────────────── */

describe('Foreman — BLOCK checks', () => {
  it('blocks when there is no estimate to review', () => {
    const r = foremanReview({ spec: spec(), estimate: undefined }, CLEAN_CTX)
    expect(r.status).toBe('BLOCK')
    expect(r.canExport).toBe(false)
    expect(r.issues.map((i) => i.id)).toContain('not-priced')
  })

  it('blocks on missing area / measurement', () => {
    const s = spec({ area: 0 })
    const r = foremanReview({ spec: s, estimate: makeEstimate({ baseCost: 0, categories: [] }) }, CLEAN_CTX)
    expect(r.status).toBe('BLOCK')
    expect(r.issues.map((i) => i.id)).toContain('no-area')
  })

  it('blocks on zero labour', () => {
    const s = spec({ area: 40 })
    const est = makeEstimate({ categories: [cat('materials', [li('Concrete supply', 1300)])] })
    const r = foremanReview({ spec: s, estimate: est }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('no-labour')
    expect(r.status).toBe('BLOCK')
  })

  it('blocks on missing materials for a concrete job', () => {
    const s = spec({ jobType: 'slab', area: 40, thicknessMm: 100 })
    const est = makeEstimate({ categories: [cat('labour', [li('Lay & finish', 2400)])] })
    const r = foremanReview({ spec: s, estimate: est }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toEqual(expect.arrayContaining(['no-materials', 'concrete-no-supply']))
    expect(r.status).toBe('BLOCK')
  })

  it('blocks concrete job with materials but no concrete supply line', () => {
    const s = spec({ jobType: 'slab', area: 40, thicknessMm: 100 })
    const est = makeEstimate({ categories: [cat('materials', [li('Reinforcing mesh', 380)]), cat('labour', [li('Lay & finish', 2400)])] })
    const r = foremanReview({ spec: s, estimate: est }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('concrete-no-supply')
  })

  it('blocks excavation job with no disposal (spoil has nowhere to go)', () => {
    const s = spec({ trade: 'earthworks', jobType: 'excavation', area: 200, thicknessMm: 0 })
    const est = estimate(s) // estimator adds plant but no disposal for a 0-depth bulk dig
    const r = foremanReview({ spec: s, estimate: est }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('dig-no-disposal')
    expect(r.status).toBe('BLOCK')
  })

  it('blocks digging with no plant', () => {
    const s = spec({ jobType: 'slab', area: 40, thicknessMm: 100, excavationDepthMm: 300 })
    const est = makeEstimate({ categories: [cat('materials', [li('Concrete supply', 1300)]), cat('labour', [li('Lay & finish', 2400)]), cat('disposal', [li('Spoil cartage', 330)])] })
    const r = foremanReview({ spec: s, estimate: est }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('dig-no-plant')
  })

  it('blocks a client total with no GST', () => {
    const s = spec({ area: 40 })
    const r = foremanReview({ spec: s, estimate: makeEstimate({ gst: 0 }) }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('no-gst')
    expect(r.status).toBe('BLOCK')
  })

  it('blocks on zero margin', () => {
    const s = spec({ area: 40 })
    const r = foremanReview({ spec: s, estimate: makeEstimate({ marginPct: 0 }) }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('zero-margin')
    expect(r.status).toBe('BLOCK')
  })
})

/* ── WARN / advisory checks ───────────────────────────────────── */

describe('Foreman — WARN checks', () => {
  it('warns on a thin margin', () => {
    const s = spec({ area: 40, soil: 'clay', location: 'Brisbane' })
    const r = foremanReview({ spec: s, estimate: makeEstimate({ marginPct: 6 }) }, CLEAN_CTX)
    expect(r.status).toBe('WARN')
    expect(r.issues.map((i) => i.id)).toContain('low-margin')
  })

  it('warns when quoting on starter rates (overhead recovery)', () => {
    const s = spec({ area: 40, soil: 'clay', location: 'Brisbane' })
    const r = foremanReview({ spec: s, estimate: makeEstimate() }, { businessConfigured: false })
    expect(r.issues.map((i) => i.id)).toContain('overhead-starter-rates')
  })

  it('warns about no deposit on a large quote', () => {
    const s = spec({ area: 40, soil: 'clay', location: 'Brisbane' })
    const r = foremanReview({ spec: s, estimate: makeEstimate({ expected: DEPOSIT_THRESHOLD + 1 }) }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('no-deposit')
  })

  it('warns on unconfirmed ground and unpinned location', () => {
    const s = spec({ area: 40, soil: 'unknown', location: '', prepRequired: true })
    const r = foremanReview({ spec: s, estimate: makeEstimate() }, CLEAN_CTX)
    const ids = r.issues.map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['soil-unknown', 'location-unknown']))
  })

  it('warns when a pump is flagged but not costed', () => {
    const s = spec({ area: 40, soil: 'clay', location: 'Brisbane', pumpRequired: true })
    const r = foremanReview({ spec: s, estimate: makeEstimate() }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('pump-not-costed')
  })
})

/* ── behavioural guarantees ───────────────────────────────────── */

describe('Foreman — behavioural guarantees', () => {
  it('is deterministic: same input → identical report', () => {
    const s = spec({ area: 40, soil: 'unknown', location: '', pumpRequired: true })
    const est = makeEstimate({ marginPct: 5, expected: 30000 })
    const a = foremanReview({ spec: s, estimate: est }, { businessConfigured: false })
    const b = foremanReview({ spec: s, estimate: est }, { businessConfigured: false })
    expect(a).toEqual(b)
  })

  it('never mutates the quote it reviews', () => {
    const s = spec({ area: 40 })
    const est = makeEstimate()
    const quote = { spec: s, estimate: est }
    const snapshot = JSON.stringify(quote)
    foremanReview(quote, CLEAN_CTX)
    expect(JSON.stringify(quote)).toBe(snapshot)
  })

  it('orders issues most-severe-first and holds export only on BLOCK', () => {
    const s = spec({ area: 0, soil: 'unknown', location: '' }) // a block + several warns
    const r = foremanReview({ spec: s, estimate: makeEstimate({ baseCost: 0, categories: [] }) }, { businessConfigured: false })
    expect(r.status).toBe('BLOCK')
    expect(r.canExport).toBe(false)
    expect(r.issues[0].severity).toBe('block')
  })

  it('lets a WARN quote export (gate is advisory, not a hard stop)', () => {
    const s = spec({ area: 40, soil: 'clay', location: 'Brisbane' })
    const r = foremanReview({ spec: s, estimate: makeEstimate({ marginPct: 6 }) }, CLEAN_CTX)
    expect(r.status).toBe('WARN')
    expect(r.canExport).toBe(true)
  })

  it('tags every issue with an area', () => {
    const s = spec({ area: 0, soil: 'unknown', location: '', pumpRequired: true })
    const r = foremanReview({ spec: s, estimate: makeEstimate({ marginPct: 0, gst: 0 }) }, { businessConfigured: false })
    expect(r.issues.length).toBeGreaterThan(0)
    const areas = ['scope', 'labour', 'materials', 'plant', 'disposal', 'commercial']
    for (const it of r.issues) expect(areas).toContain(it.area)
  })
})

/* ── scope sanity ─────────────────────────────────────────────── */

describe('Foreman — vague scope', () => {
  it("warns when the job type is 'other'", () => {
    const s = spec({ jobType: 'other', area: 40, soil: 'clay', location: 'Brisbane' })
    const r = foremanReview({ spec: s, estimate: makeEstimate() }, CLEAN_CTX)
    expect(r.issues.map((i) => i.id)).toContain('vague-scope')
    expect(r.status).toBe('WARN')
  })
})

/* ── integration with the real estimator ──────────────────────── */

describe('Foreman — integration with the real estimator', () => {
  it('a real estimated driveway is structurally complete (no missing-cost blockers)', () => {
    const s = spec({ jobType: 'driveway', area: 60, thicknessMm: 125, soil: 'clay', location: 'Brisbane', prepRequired: true, boxingRequired: true })
    const r = foremanReview({ spec: s, estimate: estimate(s) }, CLEAN_CTX)
    // The estimator produces labour, materials (incl. concrete supply), machinery
    // and disposal — so none of the "missing cost" blockers should fire.
    const missingCost = ['no-labour', 'no-materials', 'concrete-no-supply', 'dig-no-plant', 'dig-no-disposal']
    expect(r.blockers.map((b) => b.id).filter((c) => missingCost.includes(c))).toHaveLength(0)
  })

  it("the estimator's excavation-with-no-depth path leaves spoil uncosted → Foreman catches it", () => {
    // jobType excavation with no dig depth: estimator adds a machine but no disposal.
    const s = spec({ trade: 'earthworks', jobType: 'excavation', area: 200, thicknessMm: 0, excavationDepthMm: 0, prepRequired: false })
    const r = foremanReview({ spec: s, estimate: estimate(s) }, CLEAN_CTX)
    expect(r.issues.map((x) => x.id)).toContain('dig-no-disposal')
  })
})
