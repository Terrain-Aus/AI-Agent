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

  // --- concreting volume (pluggable) ---
  if (q.trade === 'concreting') {
    const area = num(q.inputs.areaM2)
    const thick = num(q.inputs.thicknessMm)
    const vol = round2((area * thick) / 1000)
    q.quantities.areaM2 = area
    q.quantities.concreteVolumeM3 = vol
    q.quantities.meshSheets = q.inputs.reinforcement ? Math.ceil(area / 13) : 0 // ~13 m² effective/sheet
    audit(q, { engine: 'Quantity', rule: 'concrete-volume', result: `vol=${vol}m³ mesh=${q.quantities.meshSheets}` })
    return q
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
