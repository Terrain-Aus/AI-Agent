// QLD civil/earthmoving seed — schema-valid defaults so screens 2–6 build and
// test before the BI setup form is done. Figures are illustrative contractor
// defaults, NOT a live feed. Screens read seedQLD and swap to live BI later.

import type { BusinessIntelligence, Pricing } from './schema'

const NOW = '2025-01-01T00:00:00.000Z'
const P = (cost: number, minimumCharge = 0, targetMarkup?: number): Pricing => ({ cost, minimumCharge, isOverridden: false, targetMarkup })

export const seedQLD: BusinessIntelligence = {
  meta: { businessName: 'Terrain Civil QLD', baseRegionId: 'brisbane', currency: 'AUD', defaultTargetMarkup: 0.3, updatedAt: NOW },
  pricingPolicy: {
    roundMachineTime: 0.5,
    minimumCallout: 220,
    minimumJobValue: 800,
    allowNegativeMargin: false,
    allowFixedPriceBelowConfidence: 0.6,
    materialMarkup: 0.15,
    subcontractMarkup: 0.12,
    fuelRecovery: 'automatic',
    travelRecovery: 'manual',
    floatRecovery: 'automatic',
  },
  regions: [
    { id: 'brisbane', name: 'Brisbane', isRemote: false, modifiers: { labourMultiplier: 1.0, plantMultiplier: 1.0, materialMultiplier: 1.0 } },
    { id: 'mtisa', name: 'Mount Isa', isRemote: true, modifiers: { labourMultiplier: 1.25, plantMultiplier: 1.3, materialMultiplier: 1.35, travelDefaultKm: 900, accommodationPerNight: 180 } },
  ],
  labour: [
    { id: 'operator', name: 'Plant Operator', pricing: P(62, 124), onCostsIncluded: true, chargeUnit: 'hour' },
    { id: 'labourer', name: 'Labourer', pricing: P(48, 96), onCostsIncluded: true, chargeUnit: 'hour' },
    { id: 'foreman', name: 'Foreman', pricing: P(78, 156), onCostsIncluded: true, chargeUnit: 'hour' },
  ],
  plant: [
    {
      id: 'ex13t',
      name: '13T Excavator',
      category: 'excavator',
      sizeClass: '13T',
      pricing: P(145, 580),
      hire: { offered: ['dry', 'wet'], default: 'wet' },
      requiresOperator: true,
      defaultOperatorRoleId: 'operator',
      fuel: { burnLitresPerHour: 18, costPerLitre: 1.85, recoveryMode: 'automatic' },
      float: { applies: true, pricing: P(450), recoveryMode: 'automatic' },
      standby: { applies: true, pricing: P(120) },
      minimumHireHours: 4,
      attachments: [
        { attachmentId: 'rockbreaker', isDefault: false },
        { attachmentId: 'mudbucket', isDefault: true },
      ],
      isPreferred: true,
    },
    {
      id: 'ex5t',
      name: '5T Excavator',
      category: 'excavator',
      sizeClass: '5T',
      pricing: P(95, 380),
      hire: { offered: ['dry', 'wet'], default: 'wet' },
      requiresOperator: true,
      defaultOperatorRoleId: 'operator',
      fuel: { burnLitresPerHour: 9, costPerLitre: 1.85, recoveryMode: 'automatic' },
      float: { applies: true, pricing: P(280), recoveryMode: 'automatic' },
      standby: { applies: true, pricing: P(95) },
      minimumHireHours: 4,
      attachments: [{ attachmentId: 'mudbucket', isDefault: true }],
      isPreferred: true,
    },
    {
      id: 'tipper',
      name: 'Tandem Tipper',
      category: 'truck',
      pricing: P(110, 220),
      hire: { offered: ['wet'], default: 'wet' },
      requiresOperator: true,
      defaultOperatorRoleId: 'operator',
      fuel: { burnLitresPerHour: 14, costPerLitre: 1.85, recoveryMode: 'automatic' },
      float: { applies: false, recoveryMode: 'none' },
      attachments: [],
      isPreferred: false,
    },
    {
      id: 'roller',
      name: 'Smooth Drum Roller',
      category: 'compaction',
      pricing: P(85, 340),
      hire: { offered: ['dry', 'wet'], default: 'dry' },
      requiresOperator: false,
      float: { applies: true, pricing: P(200), recoveryMode: 'automatic' },
      attachments: [],
      isPreferred: false,
    },
  ],
  attachments: [
    { id: 'rockbreaker', name: 'Rock Breaker', pricing: P(45) },
    { id: 'mudbucket', name: 'Mud Bucket', pricing: P(15) },
  ],
  materials: [
    { id: 'roadbase', name: 'Roadbase (DGB20)', unit: 'tonne', pricing: P(62), defaultSupplierId: 'quarry', wastageFactor: 0.05 },
    { id: 'conc25', name: 'Concrete 25MPa', unit: 'm3', pricing: P(295), defaultSupplierId: 'batch', wastageFactor: 0.05 },
    { id: 'rcp300', name: 'RCP Pipe 300mm', unit: 'lm', pricing: P(85), defaultSupplierId: 'pipeco', wastageFactor: 0.02 },
    { id: 'beddingsand', name: 'Bedding Sand', unit: 'tonne', pricing: P(48), defaultSupplierId: 'quarry', wastageFactor: 0.03 },
  ],
  suppliers: [
    { id: 'quarry', name: 'Regional Quarry', trades: ['earthworks', 'drainage'], regionIds: ['brisbane', 'mtisa'], leadTimeDays: 1, reliabilityScore: 0.9 },
    { id: 'batch', name: 'Local Batch Plant', trades: ['concreting'], regionIds: ['brisbane', 'mtisa'], leadTimeDays: 1, reliabilityScore: 0.95 },
    { id: 'pipeco', name: 'PipeCo Supplies', trades: ['drainage'], regionIds: ['brisbane'], leadTimeDays: 3, reliabilityScore: 0.85 },
  ],
  productionRates: [
    { id: 'pr_exc13', taskCode: 'EXC', description: 'Bulk dig — 13T', unit: 'm3/hr', rate: 32, basis: 'machine', appliesToPlantCategory: 'excavator', source: 'default' },
    { id: 'pr_exc5', taskCode: 'EXC', description: 'Bulk dig — 5T', unit: 'm3/hr', rate: 14, basis: 'machine', appliesToPlantCategory: 'excavator', source: 'default' },
    { id: 'pr_cart', taskCode: 'CART', description: 'Cart spoil', unit: 't/hr', rate: 22, basis: 'machine', appliesToPlantCategory: 'truck', source: 'default' },
    { id: 'pr_pipe', taskCode: 'PIPE', description: 'Lay 300 RCP', unit: 'lm/hr', rate: 18, basis: 'crew', appliesToCrewId: 'drainagecrew', source: 'learned', sampleSize: 12 },
  ],
  crews: [
    {
      id: 'drainagecrew',
      name: 'Drainage Crew',
      members: [
        { roleId: 'foreman', count: 1 },
        { roleId: 'labourer', count: 2 },
      ],
      plant: [{ plantId: 'ex5t', count: 1 }],
      isPreferred: true,
    },
  ],
  regionalOverrides: [
    // ONE Mt Isa concrete hard price (not a multiplier): remote freight baked in.
    { id: 'ov_mtisa_conc', regionId: 'mtisa', targetType: 'material', targetId: 'conc25', pricing: { cost: 420, minimumCharge: 520, isOverridden: true, pinnedCharge: 520 } },
  ],
  history: {
    jobOutcomes: [
      {
        id: 'jo1',
        jobId: 'job-1001',
        customerId: 'cust1',
        regionId: 'brisbane',
        completedAt: '2025-09-20T00:00:00.000Z',
        estimated: { hours: 40, materialCost: 6200, margin: 0.3, total: 22000 },
        actual: { hours: 46, materialCost: 6450, margin: 0.24, total: 22800 },
        variance: { hoursDelta: 6, hoursDeltaPct: 0.15, materialDelta: 250, marginDelta: -0.06 },
      },
      {
        id: 'jo2',
        jobId: 'job-1002',
        customerId: 'cust2',
        regionId: 'mtisa',
        completedAt: '2025-10-15T00:00:00.000Z',
        estimated: { hours: 120, materialCost: 28000, margin: 0.28, total: 96000 },
        actual: { hours: 118, materialCost: 27600, margin: 0.29, total: 95500 },
        variance: { hoursDelta: -2, hoursDeltaPct: -0.017, materialDelta: -400, marginDelta: 0.01 },
      },
    ],
    customers: [
      { id: 'cust1', name: 'Sunstate Developments', regionId: 'brisbane', jobsWon: 4, jobsLost: 1, totalRevenue: 92000, averageMarginAchieved: 0.26, paymentReliability: 0.9 },
      { id: 'cust2', name: 'Northwest Mining Services', regionId: 'mtisa', jobsWon: 2, jobsLost: 2, totalRevenue: 191000, averageMarginAchieved: 0.29, paymentReliability: 0.95 },
    ],
    winLoss: [
      { id: 'wl1', quoteId: 'q-2001', customerId: 'cust1', regionId: 'brisbane', outcome: 'won', quotedTotal: 22000, decidedAt: '2025-09-01T00:00:00.000Z' },
      { id: 'wl2', quoteId: 'q-2002', customerId: 'cust2', regionId: 'mtisa', outcome: 'lost', quotedTotal: 104000, competitorTotal: 98500, reason: 'price', decidedAt: '2025-10-01T00:00:00.000Z' },
    ],
    supplierPrices: [
      { supplierId: 'batch', materialId: 'conc25', pricePerUnit: 295, observedAt: '2025-11-01T00:00:00.000Z' },
      { supplierId: 'quarry', materialId: 'roadbase', pricePerUnit: 62, observedAt: '2025-11-01T00:00:00.000Z' },
    ],
  },
}
