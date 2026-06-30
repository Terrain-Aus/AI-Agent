// Configurable seed defaults. Real values come from each contractor's BI
// productivity history; these are the calibratable starting points.

import type { BusinessIntelligence, MachineClass, MaterialClass } from './types'

/** Swell (bank → loose). Fill SHRINKS when compacted. */
export const SWELL: Record<MaterialClass, number> = {
  sand: 1.12,
  gravel: 1.12,
  common_earth: 1.22,
  clay: 1.32,
  topsoil: 1.22,
  rock: 1.6,
  fill: 0.88, // compacted shrinkage
}

/** Seed dig-rate matrix m³/hr (bank) [machine × material] — mid-band. */
export const DIG_RATE: Record<MachineClass, Record<MaterialClass, number>> = {
  '1.7t': { sand: 10, gravel: 10, common_earth: 6.5, clay: 4, topsoil: 9, rock: 1, fill: 7 },
  '5t': { sand: 25, gravel: 25, common_earth: 16, clay: 10, topsoil: 22, rock: 3, fill: 18 },
  '8t': { sand: 42, gravel: 42, common_earth: 30, clay: 20, topsoil: 38, rock: 6, fill: 32 },
  '13t': { sand: 75, gravel: 75, common_earth: 50, clay: 32, topsoil: 68, rock: 11, fill: 55 },
  '20t': { sand: 125, gravel: 125, common_earth: 90, clay: 57, topsoil: 110, rock: 22, fill: 95 },
}

/** Compacted density (t/m³) for imported granular materials. */
export const DENSITY: Record<string, number> = { roadbase: 2.1, sand: 1.5, gravel: 1.6 }

export const TRUCK_CAPACITY_M3 = 8 // tandem tipper loose m³

/** Resolve a dig rate, preferring the contractor's calibrated machine productivity. */
export function digRate(bi: BusinessIntelligence, machine: MachineClass, material: MaterialClass): number {
  const plant = bi.plant.find((p) => p.type === machine)
  const calibrated = plant?.productivity?.material_m3_hr?.[material]
  return calibrated && calibrated > 0 ? calibrated : DIG_RATE[machine][material]
}

/* ════════════════ Two distinct contractor BI profiles ════════════════
 * Same engine, different numbers → different correct prices. */

export const BRISBANE_BI: BusinessIntelligence = {
  contractorId: 'brisbane-civil',
  region: 'Brisbane',
  labour: [
    { role: 'Operator', cost: 62, preferredSell: 110, minimumSell: 95, targetMargin: 0.35, overtimeMultiplier: 1.5, saturdayMultiplier: 1.5, sundayMultiplier: 2, minimumBillableHours: 4 },
    { role: 'Labourer', cost: 48, preferredSell: 85, minimumSell: 70, targetMargin: 0.35, overtimeMultiplier: 1.5, saturdayMultiplier: 1.5, sundayMultiplier: 2, minimumBillableHours: 4 },
    { role: 'Concreter', cost: 65, preferredSell: 98, minimumSell: 82, targetMargin: 0.35, overtimeMultiplier: 1.5, saturdayMultiplier: 1.5, sundayMultiplier: 2, minimumBillableHours: 4 },
    { role: 'Steel Fixer', cost: 60, preferredSell: 95, minimumSell: 80, targetMargin: 0.35, overtimeMultiplier: 1.5, saturdayMultiplier: 1.5, sundayMultiplier: 2, minimumBillableHours: 4 },
  ],
  plant: [
    {
      name: '5T Excavator', type: '5t', cost: 95, preferredSell: 165, minimumSell: 140, targetMargin: 0.4, fuelIncluded: false, operatorIncluded: false,
      minimumHireHrs: 4, minimumCharge: 660, requiresFloat: true, floatCost: 280, attachments: ['mud bucket', 'rock breaker'],
      productivity: { material_m3_hr: { clay: 11 } },
    },
    {
      name: '13T Excavator', type: '13t', cost: 145, preferredSell: 230, minimumSell: 200, targetMargin: 0.4, fuelIncluded: false, operatorIncluded: false,
      minimumHireHrs: 4, minimumCharge: 920, requiresFloat: true, floatCost: 450, attachments: ['mud bucket', 'rock breaker'],
      productivity: {},
    },
  ],
  materials: [
    { name: 'Roadbase (DGB20)', supplier: 'Quarry', rate: 62, unit: 'tonne', compactionAllowance: 0.05, minimumOrder: 0, deliveryCharge: 120 },
    // Concreting supply (single rate = COST; markup applied by Commercial)
    { name: 'Concrete N25', supplier: 'Plant', rate: 285, unit: 'm3', wastePct: 0.05, minimumOrder: 1, smallLoadFee: 180 },
    { name: 'Concrete N32', supplier: 'Plant', rate: 312, unit: 'm3', wastePct: 0.05, minimumOrder: 1, smallLoadFee: 180 },
    { name: 'Concrete N40', supplier: 'Plant', rate: 340, unit: 'm3', wastePct: 0.05, minimumOrder: 1, smallLoadFee: 180 },
    { name: 'Reo Mesh SL72', supplier: 'Steel', rate: 92, unit: 'each', wastePct: 0.1 },
    { name: 'Reo Bar N12', supplier: 'Steel', rate: 4.6, unit: 'm', wastePct: 0.05 },
    { name: 'Structural Reo (supply)', supplier: 'Steel', rate: 2400, unit: 'tonne', wastePct: 0.05 },
    { name: 'Edge Formwork', supplier: 'Timber', rate: 14, unit: 'm', wastePct: 0.1 },
    { name: 'Structural Formwork (supply & fix)', supplier: 'Formwork', rate: 95, unit: 'm2', wastePct: 0.05 },
    { name: 'Aggregate Sealer', supplier: 'Trade', rate: 7, unit: 'm2', wastePct: 0.05 },
    { name: 'Curing Compound', supplier: 'Trade', rate: 3.5, unit: 'm2', wastePct: 0.05 },
  ],
  subcontractors: [
    { type: 'Cartage', billing: ['per_load'], perLoad: 165, minimumCharge: 330 },
    { type: 'Concrete Pump', billing: ['hourly'], hourly: 180, minimumCharge: 650 },
  ],
  regions: [],
  pricingPolicy: {
    roundMachineTime: 0.5, minimumCallout: 4, minimumJobValue: 1200, allowNegativeMargin: false, allowFixedPriceBelowConfidence: 0.85,
    materialMarkup: 0.15, subcontractMarkup: 0.15, fuelRecovery: 'automatic', travelRecovery: 'automatic', floatRecovery: 'automatic',
  },
  history: { productivity: [], suppliers: [], customers: [], winLoss: [], actualVsEstimated: { hours: [], materials: [], margin: [] } },
}

/** Remote profile — bigger plant sell, remote freight, higher cartage. */
export const MT_ISA_BI: BusinessIntelligence = {
  contractorId: 'mtisa-earthworks',
  region: 'Mount Isa',
  labour: [
    { role: 'Operator', cost: 78, preferredSell: 145, minimumSell: 125, targetMargin: 0.35, overtimeMultiplier: 1.5, saturdayMultiplier: 1.6, sundayMultiplier: 2.2, minimumBillableHours: 4 },
    { role: 'Labourer', cost: 60, preferredSell: 110, minimumSell: 92, targetMargin: 0.35, overtimeMultiplier: 1.5, saturdayMultiplier: 1.6, sundayMultiplier: 2.2, minimumBillableHours: 4 },
    { role: 'Concreter', cost: 82, preferredSell: 132, minimumSell: 112, targetMargin: 0.35, overtimeMultiplier: 1.5, saturdayMultiplier: 1.6, sundayMultiplier: 2.2, minimumBillableHours: 4 },
    { role: 'Steel Fixer', cost: 78, preferredSell: 124, minimumSell: 104, targetMargin: 0.35, overtimeMultiplier: 1.5, saturdayMultiplier: 1.6, sundayMultiplier: 2.2, minimumBillableHours: 4 },
  ],
  plant: [
    {
      name: '5T Excavator', type: '5t', cost: 120, preferredSell: 210, minimumSell: 180, targetMargin: 0.4, fuelIncluded: false, operatorIncluded: false,
      minimumHireHrs: 4, minimumCharge: 840, requiresFloat: true, floatCost: 520, attachments: ['mud bucket', 'rock breaker'],
      productivity: { material_m3_hr: { clay: 9 } },
    },
    {
      name: '13T Excavator', type: '13t', cost: 185, preferredSell: 300, minimumSell: 260, targetMargin: 0.4, fuelIncluded: false, operatorIncluded: false,
      minimumHireHrs: 4, minimumCharge: 1200, requiresFloat: true, floatCost: 780, attachments: ['mud bucket', 'rock breaker'],
      productivity: {},
    },
  ],
  materials: [
    { name: 'Roadbase (DGB20)', supplier: 'Regional Quarry', rate: 95, unit: 'tonne', compactionAllowance: 0.05, minimumOrder: 0, deliveryCharge: 0, regionalFreight: 0.35 },
    // Concreting supply — remote freight loads concrete & steel materially higher.
    { name: 'Concrete N25', supplier: 'Regional Plant', rate: 360, unit: 'm3', wastePct: 0.05, minimumOrder: 1, smallLoadFee: 260, regionalFreight: 0.1 },
    { name: 'Concrete N32', supplier: 'Regional Plant', rate: 395, unit: 'm3', wastePct: 0.05, minimumOrder: 1, smallLoadFee: 260, regionalFreight: 0.1 },
    { name: 'Concrete N40', supplier: 'Regional Plant', rate: 430, unit: 'm3', wastePct: 0.05, minimumOrder: 1, smallLoadFee: 260, regionalFreight: 0.1 },
    { name: 'Reo Mesh SL72', supplier: 'Regional Steel', rate: 138, unit: 'each', wastePct: 0.1 },
    { name: 'Reo Bar N12', supplier: 'Regional Steel', rate: 6.4, unit: 'm', wastePct: 0.05 },
    { name: 'Structural Reo (supply)', supplier: 'Regional Steel', rate: 3100, unit: 'tonne', wastePct: 0.05, regionalFreight: 0.1 },
    { name: 'Edge Formwork', supplier: 'Timber', rate: 20, unit: 'm', wastePct: 0.1 },
    { name: 'Structural Formwork (supply & fix)', supplier: 'Formwork', rate: 130, unit: 'm2', wastePct: 0.05 },
    { name: 'Aggregate Sealer', supplier: 'Trade', rate: 11, unit: 'm2', wastePct: 0.05 },
    { name: 'Curing Compound', supplier: 'Trade', rate: 5, unit: 'm2', wastePct: 0.05 },
  ],
  subcontractors: [
    { type: 'Cartage', billing: ['per_load'], perLoad: 240, minimumCharge: 480 },
    { type: 'Concrete Pump', billing: ['hourly'], hourly: 240, minimumCharge: 950 },
  ],
  regions: [],
  pricingPolicy: {
    roundMachineTime: 0.5, minimumCallout: 4, minimumJobValue: 2500, allowNegativeMargin: false, allowFixedPriceBelowConfidence: 0.85,
    materialMarkup: 0.18, subcontractMarkup: 0.18, fuelRecovery: 'automatic', travelRecovery: 'automatic', floatRecovery: 'automatic',
  },
  history: { productivity: [], suppliers: [], customers: [], winLoss: [], actualVsEstimated: { hours: [], materials: [], margin: [] } },
}
