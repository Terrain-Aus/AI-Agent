// SE-QLD BusinessIntelligence seed.
//
// Sensible South-East Queensland regional rate + productivity baseline so the
// pipeline and screens 2–6 are buildable and testable against seed data BEFORE
// the full BI setup form lands. Swap for real input as screen 1 writes BI.

import type { BusinessIntelligence, SoilType } from './types'

const soilKeys: SoilType[] = ['sand', 'clay', 'reactive-clay', 'rock', 'fill', 'loam', 'unknown']
const fill = <V>(v: (s: SoilType) => V): Record<SoilType, V> =>
  soilKeys.reduce((acc, s) => ((acc[s] = v(s)), acc), {} as Record<SoilType, V>)

export const SEED_BUSINESS_INTELLIGENCE: BusinessIntelligence = {
  rates: {
    plantRates: {
      ex5t: { machineId: 'ex5t', hourlyCost: 95 }, // 5T excavator wet hire (cost)
      ex13t: { machineId: 'ex13t', hourlyCost: 145 },
      posi: { machineId: 'posi', hourlyCost: 85 }, // positrack / skid steer
      tipper: { machineId: 'tipper', hourlyCost: 110 },
    },
    labourRates: {
      operator: { roleId: 'operator', costPerHour: 62 },
      labourer: { roleId: 'labourer', costPerHour: 48 },
      leading: { roleId: 'leading', costPerHour: 72 },
    },
    materialRates: {
      conc25: { materialId: 'conc25', unit: 'm3', costRate: 295 }, // 25MPa supplied
      conc32: { materialId: 'conc32', unit: 'm3', costRate: 320 },
      roadbase: { materialId: 'roadbase', unit: 't', costRate: 62 },
      mesh: { materialId: 'mesh', unit: 'm2', costRate: 9.5 },
      drainagegravel: { materialId: 'drainagegravel', unit: 't', costRate: 78 },
    },
    disposalRates: {
      cleanfill: { tipId: 'cleanfill', perTonne: 38, material: 'clean fill' },
      mixed: { tipId: 'mixed', perTonne: 95, material: 'mixed' },
      contaminated: { tipId: 'contaminated', perTonne: 145, material: 'contaminated' },
    },
  },
  productivity: {
    // m³/hr by soil — SE-QLD baseline for a 5T machine.
    digRatesM3PerHr: fill((s) =>
      s === 'sand' ? 22 : s === 'loam' ? 18 : s === 'fill' ? 16 : s === 'clay' ? 14 : s === 'reactive-clay' ? 11 : s === 'rock' ? 4 : 13,
    ),
    // loose:bank swell.
    swellFactors: fill((s) =>
      s === 'sand' ? 1.1 : s === 'loam' ? 1.2 : s === 'clay' ? 1.3 : s === 'reactive-clay' ? 1.35 : s === 'rock' ? 1.5 : s === 'fill' ? 1.25 : 1.25,
    ),
    // in-situ density t/m³ (bank).
    bulkingFactors: fill((s) =>
      s === 'sand' ? 1.6 : s === 'loam' ? 1.5 : s === 'clay' ? 1.8 : s === 'reactive-clay' ? 1.85 : s === 'rock' ? 2.4 : s === 'fill' ? 1.7 : 1.8,
    ),
    truckPayloadTonnes: 12,
  },
  machines: [
    { id: 'ex5t', name: '5T Excavator', productivityDefault: 14, productivityUnit: 'm³/hr', hourlyCost: 95 },
    { id: 'ex13t', name: '13T Excavator', productivityDefault: 32, productivityUnit: 'm³/hr', hourlyCost: 145 },
    { id: 'posi', name: 'Positrack', productivityDefault: 60, productivityUnit: 'm²/hr', hourlyCost: 85 },
    { id: 'tipper', name: 'Tandem Tipper', productivityDefault: 12, productivityUnit: 't/load', hourlyCost: 110 },
  ],
  suppliers: [
    { id: 'batch', name: 'Local Batch Plant', materialIds: ['conc25', 'conc32'] },
    { id: 'quarry', name: 'Regional Quarry', materialIds: ['roadbase', 'drainagegravel'] },
    { id: 'steel', name: 'Steel Supplier', materialIds: ['mesh'] },
  ],
  pricingPolicy: {
    targetMargin: 0.25,
    marginFloor: 0.1,
    overheadPercent: 0.08,
    riskContingencyDefault: 0.05,
    minimumQuoteValue: 500,
    rounding: { mode: 'nearest', nearest: 10 },
  },
  jobHistory: [
    { id: 'h1', date: '2025-09-12', jobType: 'driveway', volumeM3: 28, quotedTotal: 9800, actualTotal: 10250, costPerM3: 350 },
    { id: 'h2', date: '2025-10-02', jobType: 'bulk-earthworks', volumeM3: 320, quotedTotal: 41600, actualTotal: 40100, costPerM3: 130 },
    { id: 'h3', date: '2025-11-19', jobType: 'shed-pad', volumeM3: 45, quotedTotal: 7650, actualTotal: 7600, costPerM3: 170 },
  ],
}
