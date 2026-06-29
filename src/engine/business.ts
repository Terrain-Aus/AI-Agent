// Business Profile — the commercial source of truth for every quote.
//
// Where pricing.ts holds a flat engine rate book, this is the rich, contractor-
// configured model: labour roles, plant, materials, subbies and billing rules.
// On save it PROJECTS into the engine RateBook (deriveRateBook) so every quote
// draws from these numbers — without the estimator or workspace changing shape.

import type { RateBook } from './pricing'
import { DEFAULT_RATEBOOK } from './pricing'

/* ───────────────────────── Labour ───────────────────────── */
export interface LabourRole {
  id: string
  name: string
  costPerHour: number // what the role costs you
  chargePerHour: number // what you bill the client
  overtimeMultiplier: number // e.g. 1.5×
  weekendMultiplier: number // e.g. 2.0×
  minBillableHours: number // minimum hours billed per attendance
}

/* ──────────────────── Plant & Equipment ─────────────────── */
export interface PlantItem {
  id: string
  name: string
  operatingCostPerHour: number // fuel + wear + finance
  chargePerHour: number // wet/dry hire charge-out
  floatCost: number // mobilise on/off site
  attachments: string[] // e.g. ["Rock breaker", "Auger"]
  productivityDefault: number // output per hour
  productivityUnit: string // e.g. "m³/hr", "m²/hr"
}

/* ───────────────────────── Materials ────────────────────── */
export interface RegionalPrice {
  region: string
  costRate: number
}
export interface MaterialItem {
  id: string
  name: string
  defaultSupplier: string
  costRate: number // $ per unit (base region)
  unit: string // m³, m², t, ea, lm, bag
  wastePct: number // allowance added to ordered qty
  regionalPricing: RegionalPrice[] // optional per-region overrides
}

/* ─────────────────────── Subcontractors ─────────────────── */
export type SubbieCategory = 'cartage' | 'concrete-pump' | 'traffic-control' | 'skip-bin' | 'other'
export interface SubcontractorItem {
  id: string
  name: string
  category: SubbieCategory
  rate: number
  unit: string // day, hr, load, ea
  notes: string
}

/* ───────────────────────── Billing ──────────────────────── */
export type TravelCharging = 'none' | 'per-km' | 'per-hour' | 'flat'
export interface BillingRules {
  minCallOut: number // minimum charge to turn up
  halfDayRate: number
  fullDayRate: number
  travelCharging: TravelCharging
  travelRate: number // $/km, $/hr or flat depending on travelCharging
  fuelSurchargePct: number // % added to plant/cartage
  weekendMultiplier: number // applied to labour & plant on weekends
  publicHolidayMultiplier: number
}

export interface BusinessProfile {
  /** Set true once the contractor finishes the setup wizard. */
  configured: boolean
  labourRoles: LabourRole[]
  plant: PlantItem[]
  materials: MaterialItem[]
  subcontractors: SubcontractorItem[]
  billing: BillingRules
}

/* ───────────────────── Option lists / labels ─────────────── */
export const UNIT_OPTIONS = ['m³', 'm²', 'm', 'lm', 't', 'ea', 'hr', 'day', 'load', 'bag'] as const
export const PLANT_UNIT_OPTIONS = ['m³/hr', 'm²/hr', 'lm/hr', 't/hr', 'hr'] as const
export const SUBBIE_UNIT_OPTIONS = ['day', 'hr', 'load', 'ea', 'm²', 'm³'] as const

export const SUBBIE_CATEGORIES: { key: SubbieCategory; label: string }[] = [
  { key: 'cartage', label: 'Cartage' },
  { key: 'concrete-pump', label: 'Concrete Pump' },
  { key: 'traffic-control', label: 'Traffic Control' },
  { key: 'skip-bin', label: 'Skip Bins' },
  { key: 'other', label: 'Other' },
]

export const TRAVEL_OPTIONS: { key: TravelCharging; label: string }[] = [
  { key: 'none', label: 'Not charged' },
  { key: 'per-km', label: 'Per km' },
  { key: 'per-hour', label: 'Per hour' },
  { key: 'flat', label: 'Flat fee' },
]

/* ─────────────────────── Sensible AU seed ────────────────── */
export const DEFAULT_BUSINESS: BusinessProfile = {
  configured: false,
  labourRoles: [
    { id: 'lr_concreter', name: 'Concreter', costPerHour: 48, chargePerHour: 85, overtimeMultiplier: 1.5, weekendMultiplier: 2, minBillableHours: 4 },
    { id: 'lr_labourer', name: 'Labourer', costPerHour: 38, chargePerHour: 70, overtimeMultiplier: 1.5, weekendMultiplier: 2, minBillableHours: 4 },
    { id: 'lr_leading', name: 'Leading Hand', costPerHour: 55, chargePerHour: 98, overtimeMultiplier: 1.5, weekendMultiplier: 2, minBillableHours: 4 },
  ],
  plant: [
    { id: 'pl_ex5', name: '5T Excavator', operatingCostPerHour: 45, chargePerHour: 165, floatCost: 280, attachments: ['Mud bucket', 'Trenching bucket', 'Rock breaker'], productivityDefault: 8, productivityUnit: 'm³/hr' },
    { id: 'pl_bobcat', name: 'Bobcat / Skid Steer', operatingCostPerHour: 35, chargePerHour: 140, floatCost: 220, attachments: ['4-in-1 bucket', 'Auger'], productivityDefault: 60, productivityUnit: 'm²/hr' },
  ],
  materials: [
    { id: 'mt_conc25', name: 'Concrete 25MPa', defaultSupplier: 'Local batch plant', costRate: 295, unit: 'm³', wastePct: 10, regionalPricing: [{ region: 'Mount Isa', costRate: 390 }] },
    { id: 'mt_conc32', name: 'Concrete 32MPa', defaultSupplier: 'Local batch plant', costRate: 320, unit: 'm³', wastePct: 10, regionalPricing: [] },
    { id: 'mt_mesh', name: 'Reo Mesh SL72', defaultSupplier: 'Steel supplier', costRate: 9.5, unit: 'm²', wastePct: 8, regionalPricing: [] },
    { id: 'mt_roadbase', name: 'Roadbase', defaultSupplier: 'Quarry', costRate: 62, unit: 't', wastePct: 5, regionalPricing: [] },
  ],
  subcontractors: [
    { id: 'sc_pump', name: 'Concrete Pump', category: 'concrete-pump', rate: 1250, unit: 'day', notes: 'Line/boom + pump hand. Min 1 day.' },
    { id: 'sc_cartage', name: 'Tipper Cartage', category: 'cartage', rate: 150, unit: 'hr', notes: 'Spoil haulage off site.' },
    { id: 'sc_skip', name: 'Skip Bin 6m³', category: 'skip-bin', rate: 420, unit: 'ea', notes: 'Mixed waste, swap-and-go.' },
    { id: 'sc_traffic', name: 'Traffic Control', category: 'traffic-control', rate: 95, unit: 'hr', notes: 'TGS + TMA if on road reserve.' },
  ],
  billing: {
    minCallOut: 220,
    halfDayRate: 480,
    fullDayRate: 880,
    travelCharging: 'per-km',
    travelRate: 1.65,
    fuelSurchargePct: 6,
    weekendMultiplier: 1.5,
    publicHolidayMultiplier: 2.5,
  },
}

/* ───────────────── Project profile → engine RateBook ─────── */
const avg = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0)
const find = <T extends { name: string }>(list: T[], re: RegExp) => list.find((x) => re.test(x.name.toLowerCase()))

/**
 * Map the rich Business Profile onto the flat RateBook the estimator consumes.
 * Derives the big-ticket rates from the profile; preserves the fallback for the
 * rates the profile doesn't directly model. This is what makes the profile the
 * commercial source of truth without changing the estimator or workspace.
 */
export function deriveRateBook(b: BusinessProfile, fallback: RateBook = DEFAULT_RATEBOOK): RateBook {
  const labour = avg(b.labourRoles.map((r) => r.chargePerHour)) || fallback.labourHourly
  const conc = find(b.materials, /concrete|mpa/)
  const mesh = find(b.materials, /mesh|reo/)
  const exposed = find(b.materials, /exposed|decorative/)
  const pump = b.subcontractors.find((s) => s.category === 'concrete-pump')
  const cartage = b.subcontractors.find((s) => s.category === 'cartage')
  const excavator = find(b.plant, /excavat/)
  const bobcat = find(b.plant, /bobcat|skid|posi|loader/)

  const pumpDay = pump ? (pump.unit === 'hr' ? pump.rate * 8 : pump.rate) : fallback.pumpDayRate
  const tipper = cartage && cartage.unit === 'hr' ? cartage.rate : fallback.tipperHourly

  return {
    ...fallback,
    labourHourly: round(labour),
    concretePerM3: conc ? round(conc.costRate) : fallback.concretePerM3,
    exposedAggPremiumM3: exposed ? round(Math.max(0, exposed.costRate - (conc?.costRate ?? 0))) : fallback.exposedAggPremiumM3,
    meshPerM2: mesh ? round2(mesh.costRate) : fallback.meshPerM2,
    pumpDayRate: round(pumpDay),
    excavatorHourly: excavator ? round(excavator.chargePerHour) : fallback.excavatorHourly,
    bobcatHourly: bobcat ? round(bobcat.chargePerHour) : fallback.bobcatHourly,
    tipperHourly: round(tipper),
  }
}

const round = (n: number) => Math.round(n)
const round2 = (n: number) => Math.round(n * 100) / 100

/** Quick completeness signal for the setup UI. */
export function businessCompleteness(b: BusinessProfile): { filled: number; total: number; pct: number } {
  const checks = [b.labourRoles.length > 0, b.plant.length > 0, b.materials.length > 0, b.subcontractors.length > 0, b.billing.fullDayRate > 0]
  const filled = checks.filter(Boolean).length
  return { filled, total: checks.length, pct: Math.round((filled / checks.length) * 100) }
}
