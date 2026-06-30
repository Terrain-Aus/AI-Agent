import { describe, it, expect } from 'vitest'
import { estimate, structuralRawInput } from '../index'
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

const suspendedSlab = () => estimate(structuralRawInput({ jobType: 'suspended_slab' }), BRISBANE_BI)
const columns = () =>
  estimate(structuralRawInput({ jobType: 'columns', columnCount: 8, columnWidthMm: 400, columnDepthMm: 400, columnHeightM: 3.2 }), BRISBANE_BI)
const beams = () => estimate(structuralRawInput({ jobType: 'beams', beamLengthM: 24, beamWidthMm: 350, beamDepthMm: 600 }), BRISBANE_BI)
const wall = () => estimate(structuralRawInput({ jobType: 'structural_wall', wallLengthM: 18, wallHeightM: 2.7, wallThicknessMm: 200 }), BRISBANE_BI)

describe('STRUCTURAL — invariants hold for engineered concreting', () => {
  it('quantities stay dollar-free (LAW 1)', () => {
    for (const q of [suspendedSlab(), columns(), beams(), wall()]) {
      expect(moneyKeys(q.quantities)).toEqual([])
    }
  })

  it('every rated line records a trigger + kind (LAW 7)', () => {
    for (const q of [suspendedSlab(), columns(), beams(), wall()]) {
      for (const l of q.rated!.lines) {
        expect(l.trigger.length).toBeGreaterThan(0)
        expect(['labour', 'plant', 'material', 'subbie', 'fee']).toContain(l.kind)
      }
    }
  })

  it('structural scope carries reo tonnage + structural formwork + steel-fixer labour', () => {
    const s = suspendedSlab()
    expect(s.quantities.reoTonnes).toBeGreaterThan(0)
    expect(s.quantities.formworkM2).toBeGreaterThan(0)
    expect(s.quantities.steelFixHours).toBeGreaterThan(0)
    expect(s.quantities.meshSheets).toBe(0) // engineered bar, not mesh
    // priced lines exist for each
    const items = s.rated!.lines.map((l) => l.item.toLowerCase()).join('|')
    expect(items).toMatch(/structural reo|reo \(supply\)/)
    expect(items).toMatch(/structural formwork/)
    expect(s.rated!.lines.some((l) => /steel fixer/i.test(l.item))).toBe(true)
  })

  it('structural is always boom-pumped — priced THROUGH Rate as a subbie (LAW 3), even with open access', () => {
    const q = estimate(structuralRawInput({ jobType: 'beams', beamLengthM: 24, beamWidthMm: 350, beamDepthMm: 600, access: 'open' }), BRISBANE_BI)
    const pump = q.rated!.lines.find((l) => /pump/i.test(l.item))
    expect(pump).toBeDefined()
    expect(pump!.kind).toBe('subbie')
    expect(pump!.charge).toBe(pump!.cost) // at cost here; Commercial marks it up (LAW 5)
    // exactly one pump line — the open-access flatwork path must not also add one
    expect(q.rated!.lines.filter((l) => /pump/i.test(l.item)).length).toBe(1)
  })

  it('columns use N40, suspended slabs N32 — grade follows the element', () => {
    expect(columns().rated!.lines.some((l) => /n40/i.test(l.item))).toBe(true)
    expect(suspendedSlab().rated!.lines.some((l) => /n32/i.test(l.item))).toBe(true)
  })
})

describe('STRUCTURAL — different elements produce different quantities & hidden costs', () => {
  it('volumes, reo intensity and hidden-cost sets differ by element', () => {
    const s = suspendedSlab()
    const c = columns()
    const w = wall()
    expect(c.quantities.concreteVolumeM3).not.toBe(s.quantities.concreteVolumeM3)
    expect(w.quantities.formworkM2).not.toBe(s.quantities.formworkM2)
    // columns are far more heavily reinforced per m³ than a suspended slab
    const intensity = (q: typeof s) => (q.quantities.reoTonnes ?? 0) / (q.quantities.concreteVolumeM3 ?? 1)
    expect(intensity(c)).toBeGreaterThan(intensity(s))
  })
})

describe('STRUCTURAL — certification & inspection gates', () => {
  it('every structural quote certifies + cures, and validation flags the reo inspection hold point', () => {
    const s = suspendedSlab()
    const hidden = s.hiddenCosts.map((h) => h.item).join('|')
    expect(/certification/i.test(hidden)).toBe(true)
    expect(/curing/i.test(hidden)).toBe(true)
    const text = s.validation!.findings.map((f) => f.detail).join(' ').toLowerCase()
    expect(text).toContain('inspection')
    expect(s.riskFlags.some((f) => /engineer/i.test(f))).toBe(true)
  })

  it('missing engineer details warns and dents confidence', () => {
    const withDetails = estimate(structuralRawInput({ jobType: 'beams', beamLengthM: 24, beamWidthMm: 350, beamDepthMm: 600 }), BRISBANE_BI)
    const without = estimate(
      structuralRawInput({
        jobType: 'beams',
        beamLengthM: 24,
        beamWidthMm: 350,
        beamDepthMm: 600,
        engineerDetails: false,
        __sources: { engineerDetails: { source: 'unknown', confidence: 0.2 } },
      }),
      BRISBANE_BI,
    )
    expect(without.validation!.findings.some((f) => f.check === 'engineerDetails')).toBe(true)
    expect(without.confidence!).toBeLessThan(withDetails.confidence!)
  })
})

describe('STRUCTURAL — swapping BI changes dollars but NOT quantities', () => {
  it('Brisbane vs Mt Isa: identical quantities, different money', () => {
    const raw = structuralRawInput({ jobType: 'columns', columnCount: 8, columnWidthMm: 400, columnDepthMm: 400, columnHeightM: 3.2 })
    const bne = estimate(raw, BRISBANE_BI)
    const isa = estimate(raw, MT_ISA_BI)
    expect(isa.quantities.concreteVolumeM3).toBe(bne.quantities.concreteVolumeM3)
    expect(isa.quantities.reoTonnes).toBe(bne.quantities.reoTonnes)
    expect(isa.quantities.formworkM2).toBe(bne.quantities.formworkM2)
    expect(isa.quantities.steelFixHours).toBe(bne.quantities.steelFixHours)
    expect(isa.internalSheet!.costTotal).not.toBe(bne.internalSheet!.costTotal)
    expect(isa.internalSheet!.sellTotal).not.toBe(bne.internalSheet!.sellTotal)
  })
})
