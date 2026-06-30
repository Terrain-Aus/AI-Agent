// QUANTITY ENGINE — convert facts → physical quantities using formulas +
// production rates read from BI. DOLLAR-FREE (LAW 1). Emits NET material
// quantities (waste applied later by Rate). Enforces BANK vs LOOSE (LAW 2).

import type { BusinessIntelligence, MachineClass, MaterialClass, Quote } from './types'
import { audit } from './types'
import { SWELL, DENSITY, TRUCK_CAPACITY_M3, digRate } from './seed'

const num = (v: unknown, d = 0): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : d)
const round2 = (n: number) => Math.round(n * 100) / 100

/** Choose a machine by access limit, then by volume; upsize + breaker for rock. */
function selectMachine(bankM3: number, material: MaterialClass, access: string): MachineClass {
  if (access === 'restricted') return '1.7t' // 900mm gate → mini only
  let base: MachineClass = bankM3 > 400 ? '20t' : bankM3 > 150 ? '13t' : bankM3 > 40 ? '8t' : bankM3 > 8 ? '5t' : '1.7t'
  if (material === 'rock') {
    // upsize one class for rock
    const order: MachineClass[] = ['1.7t', '5t', '8t', '13t', '20t']
    const i = Math.min(order.length - 1, order.indexOf(base) + 1)
    base = order[i]
  }
  return base
}

export function runQuantity(q: Quote, bi: BusinessIntelligence): Quote {
  const material = (q.inputs.material as MaterialClass) ?? 'common_earth'

  // --- spoil_removal: pure cartage on LOOSE volume (no dig) ---
  if (q.jobType === 'spoil_removal') {
    const loose = round2(num(q.inputs.spoilLooseM3))
    q.quantities.spoilLooseM3 = loose
    q.quantities.truckLoads = Math.ceil(loose / TRUCK_CAPACITY_M3) // ROUND UP
    audit(q, { engine: 'Quantity', rule: 'cartage-only', result: `loose=${loose}m³ loads=${q.quantities.truckLoads}` })
    return q
  }

  // --- precision jobs: priced on area + grade tolerance, NOT volume ---
  if (q.derived.precisionJob) {
    q.quantities.areaM2 = round2(num(q.inputs.areaM2))
    audit(q, { engine: 'Quantity', rule: 'precision-area', result: `area=${q.quantities.areaM2}m² (grade ±${num(q.inputs.gradeToleranceMm)}mm)` })
    return q
  }

  // --- concreting (per-jobType) ---
  if (q.trade === 'concreting') {
    return runConcretingQuantity(q)
  }

  // --- earthworks cut ---
  let bankM3: number
  if (q.inputs.lengthM != null && q.inputs.widthMm != null && q.inputs.depthMm != null) {
    // trench
    bankM3 = round2(num(q.inputs.lengthM) * (num(q.inputs.widthMm) / 1000) * (num(q.inputs.depthMm) / 1000))
  } else {
    // area cut
    bankM3 = round2(num(q.inputs.areaM2) * (num(q.inputs.cutDepthMm) / 1000))
  }
  q.quantities.cutVolumeBankM3 = bankM3

  // LAW 2: cartage/loads from LOOSE volume (bank × swell). Never off bank.
  const swell = SWELL[material] ?? 1.25
  const looseM3 = round2(bankM3 * swell)
  const cartageRequired = q.inputs.cartageRequired !== false && q.derived.producesSpoil
  if (cartageRequired) {
    q.quantities.spoilLooseM3 = looseM3
    q.quantities.truckLoads = Math.ceil(looseM3 / TRUCK_CAPACITY_M3) // ROUND UP — pay per trip
  }

  // LAW 2: dig time from BANK volume.
  const access = (q.inputs.access as string) ?? 'open'
  const machine = selectMachine(bankM3, material, access)
  q.inputs.__machine = machine
  const rate = digRate(bi, machine, material)
  const machineHours = round2(bankM3 / rate)
  q.quantities.machineHours = machineHours
  // operator hours = machine hours + setup/float load-unload (>= machineHours)
  q.quantities.operatorHours = round2(machineHours + 1)

  // imported roadbase (NET tonnes; waste/compaction grossed by Rate)
  if (q.derived.requiresImport && q.inputs.roadbaseDepthMm != null) {
    const area = num(q.inputs.areaM2)
    const depth = num(q.inputs.roadbaseDepthMm) / 1000
    q.quantities.roadbaseTonnes = round2(area * depth * DENSITY.roadbase)
    q.quantities.compactionPasses = 4
  }

  audit(q, {
    engine: 'Quantity',
    rule: 'bank-vs-loose',
    result: `bank=${bankM3}m³ → loose=${looseM3}m³ (${material} swell ${swell}); dig ${machineHours}h on ${machine}@${rate}m³/h; loads=${q.quantities.truckLoads ?? 0} (from loose)`,
  })
  return q
}

/* ════════════════ Concreting quantities (DOLLAR-FREE) ════════════════ */

interface ConcreteJobCfg {
  grade: 'Concrete N25' | 'Concrete N32'
  placeRate: number // m²/hr for the placing crew (lower = harder finish)
  subBaseDepthMm: number // default compacted granular sub-base
  jointFactor: number // lm of control-joint saw cut per m²
  formFactor: number // perimeter ≈ formFactor × √area (higher = more elongated)
}

// Per-jobType physical assumptions. Real numbers come from BI history; these
// are calibratable starting points. Money lives nowhere in here (LAW 1).
const CONCRETING: Record<string, ConcreteJobCfg> = {
  slab: { grade: 'Concrete N25', placeRate: 13, subBaseDepthMm: 75, jointFactor: 0.22, formFactor: 4.2 },
  exposed_aggregate_driveway: { grade: 'Concrete N32', placeRate: 8, subBaseDepthMm: 100, jointFactor: 0.28, formFactor: 5.5 },
  shed_slab: { grade: 'Concrete N25', placeRate: 12, subBaseDepthMm: 100, jointFactor: 0.18, formFactor: 4.2 },
  crossover: { grade: 'Concrete N32', placeRate: 9, subBaseDepthMm: 150, jointFactor: 0.25, formFactor: 5.0 },
  paths_flatwork: { grade: 'Concrete N25', placeRate: 11, subBaseDepthMm: 50, jointFactor: 0.33, formFactor: 6.0 },
  // legacy aliases
  house_slab: { grade: 'Concrete N25', placeRate: 13, subBaseDepthMm: 75, jointFactor: 0.22, formFactor: 4.2 },
  driveway: { grade: 'Concrete N32', placeRate: 10, subBaseDepthMm: 100, jointFactor: 0.25, formFactor: 5.0 },
}

const FORM_LM_PER_HR = 12 // edge form set + strip
const SAW_LM_PER_HR = 40 // control-joint cutting

function reinforced(v: unknown): boolean {
  return v != null && v !== false && v !== 'none' && v !== ''
}

function runConcretingQuantity(q: Quote): Quote {
  if (q.jobType === 'footings_piers') return runFootingsQuantity(q)

  const cfg = CONCRETING[q.jobType ?? 'slab'] ?? CONCRETING.slab
  const area = num(q.inputs.areaM2)
  const thick = num(q.inputs.thicknessMm, 100)

  let vol = round2((area * thick) / 1000)
  const formLm = q.inputs.perimeterM != null ? round2(num(q.inputs.perimeterM)) : round2(cfg.formFactor * Math.sqrt(Math.max(area, 0)))

  // Shed slabs are typically poured with a thickened edge beam — extra concrete.
  if (q.jobType === 'shed_slab' && q.inputs.thickenedEdge !== false) {
    const extra = round2(formLm * Math.max(0, 0.09 - (thick / 1000) * 0.3)) // 300×300 edge beam over slab section
    vol = round2(vol + extra)
  }

  const sawCutLm = round2(area * cfg.jointFactor)
  // One concreter line carries place+finish, form set/strip and saw cutting so
  // the per-attendance minimum is applied once, not per sub-task.
  const placeFinishHours = round2(Math.max(3, area / cfg.placeRate) + formLm / FORM_LM_PER_HR + sawCutLm / SAW_LM_PER_HR)

  const subDepth = q.inputs.subBaseDepthMm != null ? num(q.inputs.subBaseDepthMm) : q.inputs.subBase === 'none' ? 0 : cfg.subBaseDepthMm
  const subBaseTonnes = subDepth > 0 ? round2(area * (subDepth / 1000) * DENSITY.roadbase) : 0

  q.quantities.areaM2 = area
  q.quantities.concreteVolumeM3 = vol
  q.quantities.meshSheets = reinforced(q.inputs.reinforcement) ? Math.ceil(area / 13) : 0 // ~13 m² effective per sheet
  q.quantities.formworkLm = formLm
  q.quantities.sawCutLm = sawCutLm
  q.quantities.placeFinishHours = placeFinishHours
  q.quantities.subBaseTonnes = subBaseTonnes
  if (subBaseTonnes > 0) q.derived.requiresImport = true

  q.inputs.__concreteGrade = cfg.grade

  audit(q, {
    engine: 'Quantity',
    rule: 'concrete-flatwork',
    result: `area=${area}m² vol=${vol}m³ (${cfg.grade}) mesh=${q.quantities.meshSheets} form=${formLm}lm saw=${sawCutLm}lm subbase=${subBaseTonnes}t place=${placeFinishHours}h`,
  })
  return q
}

function runFootingsQuantity(q: Quote): Quote {
  const fLen = num(q.inputs.footingLengthM)
  const fW = num(q.inputs.footingWidthMm, 300)
  const fD = num(q.inputs.footingDepthMm, 400)
  const piers = Math.max(0, Math.round(num(q.inputs.pierCount)))
  const pDia = num(q.inputs.pierDiameterMm, 300)
  const pDepth = num(q.inputs.pierDepthMm, 600)

  const footingVol = round2(fLen * (fW / 1000) * (fD / 1000))
  const pierVol = round2(piers * Math.PI * Math.pow(pDia / 2000, 2) * (pDepth / 1000))
  const vol = round2(footingVol + pierVol)

  // 4-bar cage in footings + 4-bar cage down each pier (+ ~0.3m starter).
  const reoBarLm = round2(fLen * 4 + piers * 4 * (pDepth / 1000 + 0.3))

  q.quantities.footingConcreteM3 = vol
  q.quantities.concreteVolumeM3 = vol
  q.quantities.pierCount = piers
  q.quantities.reoBarLm = reinforced(q.inputs.reinforcement) ? reoBarLm : 0
  q.quantities.meshSheets = 0
  q.quantities.subBaseTonnes = 0
  q.quantities.formworkLm = 0 // footings are trench-formed
  // Place-only (no broom/trowel finish): ~8 lm/hr of footing + 0.4h per pier.
  q.quantities.placeFinishHours = round2(Math.max(3, fLen / 8 + piers * 0.4))

  q.inputs.__concreteGrade = 'Concrete N32'

  audit(q, {
    engine: 'Quantity',
    rule: 'footings-piers',
    result: `footing=${footingVol}m³ + ${piers} piers ${pierVol}m³ = ${vol}m³ (N32); reo=${q.quantities.reoBarLm}lm place=${q.quantities.placeFinishHours}h`,
  })
  return q
}
