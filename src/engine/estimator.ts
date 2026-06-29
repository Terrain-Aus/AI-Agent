// The estimator: JobSpec -> full Estimate with low/expected/high, category
// breakdowns, hidden-cost-driven contingency, margin and a plain-English summary.

import type { CostCategory, Estimate, JobSpec, LineItem } from './types'
import {
  DEFAULT_RATEBOOK,
  RateBook,
  resolveLocation,
  SPOIL_TONNES_PER_M3,
} from './pricing'
import { detectHiddenCosts } from './hiddenCosts'

const GST = 0.1
const WASTAGE = 1.1 // 10% concrete wastage / spillage allowance

function li(label: string, detail: string, qty: number, unit: string, rate: number): LineItem {
  return { label, detail, qty: round2(qty), unit, rate: round2(rate), total: round2(qty * rate) }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round0 = (n: number) => Math.round(n)

export function estimate(spec: JobSpec, book: RateBook = DEFAULT_RATEBOOK): Estimate {
  const loc = resolveLocation(spec.location)
  const area = Math.max(spec.area, 0)
  const isConcrete = spec.trade === 'concreting' || ['driveway', 'slab', 'shed-slab', 'path-footpath', 'patio'].includes(spec.jobType)

  // Concrete volume (m³) for slab-type jobs.
  const volumeM3 = isConcrete ? round2((area * spec.thicknessMm) / 1000 * WASTAGE) : 0

  // ---------- MATERIALS ----------
  const materials: LineItem[] = []
  if (volumeM3 > 0) {
    const supplyRate =
      book.concretePerM3 +
      loc.supplyLoadM3 +
      (spec.finish === 'exposed-aggregate' ? book.exposedAggPremiumM3 : 0)
    materials.push(
      li('Concrete supply', `${spec.thicknessMm}mm @ ${spec.finish.replace('-', ' ')}${loc.supplyLoadM3 ? ' (remote freight loaded)' : ''}`, volumeM3, 'm³', supplyRate),
    )
    if (spec.reinforcement) {
      materials.push(li('Reinforcing mesh', 'SL72 mesh, bar chairs & tie wire', area, 'm²', book.meshPerM2))
    }
    materials.push(li('Sundries', 'Curing compound, formwork pegs, expansion joints', area, 'm²', 2.4))
    if (spec.finish === 'exposed-aggregate') {
      materials.push(li('Sealer & retarder', '2 coats sealer + surface retarder', area, 'm²', 5.5))
    }
    if (spec.finish === 'coloured' || spec.finish === 'stencil') {
      materials.push(li('Oxide / colour', 'Through-colour or surface oxide', area, 'm²', 6.5))
    }
  }
  if (spec.jobType === 'turf' || spec.finish === 'turf') {
    materials.push(li('Turf supply', 'Buffalo / couch turf incl. delivery', area, 'm²', 12.5))
    materials.push(li('Underlay & soil', 'Turf underlay, topdress & starter fert', area, 'm²', 6))
  }
  if (spec.jobType === 'paving' || spec.finish === 'pavers') {
    materials.push(li('Pavers supply', 'Concrete / clay pavers incl. delivery', area, 'm²', 42))
    materials.push(li('Bedding sand & jointing', 'Roadbase, bedding sand, jointing sand', area, 'm²', 11))
  }

  // ---------- LABOUR ----------
  const labour: LineItem[] = []
  if (spec.prepRequired) {
    labour.push(li('Site prep & set-out', 'Strip, trim, compact, set levels & string lines', area, 'm²', book.prepLabourPerM2))
  }
  if (spec.boxingRequired) {
    const perimeter = spec.perimeterM ?? estimatePerimeter(area)
    labour.push(li('Boxing / formwork', 'Set, brace, strip & cart formwork', perimeter, 'lm', book.boxingPerM))
  }
  const finishRate = book.finishLabourPerM2[spec.finish] ?? book.finishLabourPerM2.plain
  if (finishRate > 0 && (volumeM3 > 0 || spec.finish === 'turf' || spec.finish === 'pavers')) {
    labour.push(li('Lay & finish', `Place, screed & ${labelFinish(spec.finish)}`, area, 'm²', finishRate))
  }
  // Travel labour for remote/regional crews.
  if (loc.travelHrs >= 1) {
    labour.push(li('Crew travel', `Return travel to ${loc.name} (2-person crew)`, loc.travelHrs * 2, 'hr', book.labourHourly))
  }

  // ---------- MACHINERY ----------
  const machinery: LineItem[] = []
  const digDepth = spec.excavationDepthMm || (spec.prepRequired ? 150 : 0)
  const spoilM3 = round2((area * digDepth) / 1000)
  if (digDepth > 0) {
    const exHrs = Math.max(3, round2(spoilM3 / 8))
    machinery.push(li('Excavator + operator', `Wet hire, ~${spoilM3}m³ dig`, exHrs, 'hr', book.excavatorHourly))
    const bobHrs = Math.max(2, round2(area / 60))
    machinery.push(li('Bobcat / skid steer', 'Load-out, trim & spread', bobHrs, 'hr', book.bobcatHourly))
  }
  if (spec.pumpRequired) {
    machinery.push(li('Concrete pump', 'Line/boom pump hire + pump hand', 1, 'day', book.pumpDayRate))
  }
  if (spec.jobType === 'excavation' && digDepth === 0) {
    const exHrs = Math.max(4, round2(area / 50))
    machinery.push(li('Excavator + operator', 'Bulk earthworks wet hire', exHrs, 'hr', book.excavatorHourly))
  }

  // ---------- DISPOSAL ----------
  const disposal: LineItem[] = []
  if (spoilM3 > 0) {
    const tonnes = round2(spoilM3 * SPOIL_TONNES_PER_M3)
    const tipRate = spec.soil === 'fill' || spec.soil === 'reactive-clay' ? book.disposalContaminatedPerTonne : book.disposalPerTonne
    disposal.push(li('Spoil cartage', 'Tipper haulage off site', Math.max(2, round2(tonnes / 12)), 'load', 165))
    disposal.push(li('Tipping fees', spec.soil === 'fill' ? 'Mixed/contaminated fill rate' : 'Clean fill rate', tonnes, 't', tipRate))
  }
  if (spec.boxingRequired) {
    disposal.push(li('Rubbish removal', 'Stripped timber, offcuts & site clean', 1, 'item', 180))
  }

  // ---------- DELIVERY ----------
  const delivery: LineItem[] = []
  if (volumeM3 > 0) {
    const cartRate = book.deliveryBaseM3 * loc.multiplier
    delivery.push(li('Concrete cartage', `${loc.name} delivery${loc.multiplier > 1 ? ` (×${loc.multiplier} regional)` : ''}`, volumeM3, 'm³', cartRate))
    if (volumeM3 < 6) {
      delivery.push(li('Short-load fee', 'Part-load surcharge under 6m³', 1, 'item', volumeM3 < 3 ? 220 : 130))
    }
  }
  if (materials.some((m) => /turf|paver/i.test(m.label))) {
    delivery.push(li('Material delivery', 'Truck & crane/tailgate offload', 1, 'item', 180 * loc.multiplier))
  }

  // Assemble categories.
  const categories: CostCategory[] = [
    cat('materials', 'Materials', materials),
    cat('labour', 'Labour', labour),
    cat('machinery', 'Machinery', machinery),
    cat('disposal', 'Disposal', disposal),
    cat('delivery', 'Delivery', delivery),
  ].filter((c) => c.items.length > 0)

  const baseCost = round0(categories.reduce((s, c) => s + c.subtotal, 0))

  // ---------- HIDDEN COSTS & CONTINGENCY ----------
  const hiddenCosts = detectHiddenCosts(spec, volumeM3)
  // Contingency covers the *excluded* hidden costs partially + a risk buffer.
  const excludedExposure = hiddenCosts.filter((h) => !h.included).reduce((s, h) => s + h.estImpact, 0)
  const riskWeight = hiddenCosts.some((h) => h.severity === 'critical')
    ? 0.6
    : hiddenCosts.some((h) => h.severity === 'high')
      ? 0.45
      : 0.3
  const contingency = round0(excludedExposure * riskWeight)

  // ---------- MARGIN, GST, RANGE ----------
  const costPlusContingency = baseCost + contingency
  const marginPct = book.defaultMarginPct
  const marginAmount = round0(costPlusContingency * (marginPct / 100))
  const subtotalExGst = costPlusContingency + marginAmount
  const gst = round0(subtotalExGst * GST)
  const expected = round0(subtotalExGst + gst)

  // Range reflects estimating uncertainty + unflagged risk.
  const confidence = computeConfidence(spec, hiddenCosts.length)
  const spread = lerp(0.06, 0.2, (100 - confidence) / 100)
  const low = round0(expected * (1 - spread))
  const high = round0(expected * (1 + spread + (hiddenCosts.some((h) => h.severity === 'critical') ? 0.08 : 0)))

  const summary = buildSummary(spec, { expected, low, high, baseCost, marginPct, hiddenCount: hiddenCosts.length, loc: loc.name, remote: loc.remote })

  return {
    categories,
    baseCost,
    hiddenCosts,
    contingency,
    marginPct,
    marginAmount,
    subtotalExGst: round0(subtotalExGst),
    gst,
    expected,
    low,
    high,
    summary,
    confidence,
  }
}

function cat(key: CostCategory['key'], title: string, items: LineItem[]): CostCategory {
  return { key, title, items, subtotal: round0(items.reduce((s, i) => s + i.total, 0)) }
}

function estimatePerimeter(area: number): number {
  // Assume a roughly 1.6:1 rectangle for boxing estimates.
  const w = Math.sqrt(area / 1.6)
  const l = area / w
  return round2(2 * (w + l))
}

function labelFinish(f: string): string {
  switch (f) {
    case 'exposed-aggregate':
      return 'expose & wash-off'
    case 'broom':
      return 'broom finish'
    case 'polished':
      return 'grind & polish'
    case 'turf':
      return 'lay turf'
    case 'pavers':
      return 'lay pavers'
    default:
      return 'trowel finish'
  }
}

function computeConfidence(spec: JobSpec, hiddenCount: number): number {
  let c = 85
  if (spec.soil === 'unknown') c -= 12
  if (!spec.location || resolveLocation(spec.location).name === 'Unknown location') c -= 10
  if (spec.area <= 0) c -= 30
  if (hiddenCount >= 4) c -= 8
  if (spec.access === 'difficult') c -= 5
  return Math.max(35, Math.min(95, c))
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t))

function buildSummary(
  spec: JobSpec,
  o: { expected: number; low: number; high: number; baseCost: number; marginPct: number; hiddenCount: number; loc: string; remote: boolean },
): string {
  const fmt = (n: number) => '$' + n.toLocaleString('en-AU')
  const bits: string[] = []
  bits.push(
    `${spec.area}m² ${spec.jobType.replace('-', ' ')} in ${o.loc}. I'd quote it at ${fmt(o.expected)} inc GST — range ${fmt(o.low)} to ${fmt(o.high)} depending on what the ground throws up.`,
  )
  if (o.remote) bits.push(`Heads up: ${o.loc} is remote, so freight and travel are doing a lot of the damage here — don't price it like a city job.`)
  if (o.hiddenCount > 0) bits.push(`I've flagged ${o.hiddenCount} hidden cost${o.hiddenCount > 1 ? 's' : ''} below. Read them before you send this — that's where contractors lose their margin.`)
  bits.push(`Margin's set at ${o.marginPct}%. If it's a tight market, that's your room to move — but don't drop below cost + contingency or you're working for nothing.`)
  return bits.join(' ')
}
