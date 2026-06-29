// Australian pricing reference for the estimator.
// Rates are indicative 2025/26 trade figures (ex-GST unless noted) and are
// fully editable from the Pricing Database screen. Treat these as the seed.

import type { Finish, JobType, SoilType } from './types'

export interface RateBook {
  /** Concrete supply $/m³ delivered, by finish/spec. */
  concretePerM3: number
  /** Exposed-aggregate / decorative supply premium $/m³. */
  exposedAggPremiumM3: number
  /** Reo mesh (SL72) $/m². */
  meshPerM2: number
  /** Pour + screed + finish labour $/m² (plain). */
  finishLabourPerM2: Record<Finish, number>
  /** Excavation / site prep labour $/m². */
  prepLabourPerM2: number
  /** Boxing / formwork $/lineal m. */
  boxingPerM: number
  /** Concrete pump hire (day rate + min). */
  pumpDayRate: number
  /** Excavator + operator wet hire $/hr. */
  excavatorHourly: number
  /** Bobcat / skid steer wet hire $/hr. */
  bobcatHourly: number
  /** Tipper truck cartage $/hr. */
  tipperHourly: number
  /** Spoil disposal tipping fee $/tonne (clean fill). */
  disposalPerTonne: number
  /** Contaminated / mixed spoil tipping $/tonne. */
  disposalContaminatedPerTonne: number
  /** Concrete delivery base cartage within metro $/m³. */
  deliveryBaseM3: number
  /** Default labour crew chargeout $/hr/head. */
  labourHourly: number
  /** Default target margin %. */
  defaultMarginPct: number
}

export const DEFAULT_RATEBOOK: RateBook = {
  concretePerM3: 295,
  exposedAggPremiumM3: 70,
  meshPerM2: 9.5,
  finishLabourPerM2: {
    plain: 62,
    broom: 66,
    'exposed-aggregate': 95,
    coloured: 82,
    stencil: 88,
    polished: 130,
    pavers: 75,
    turf: 28,
    na: 0,
  },
  prepLabourPerM2: 22,
  boxingPerM: 24,
  pumpDayRate: 1250,
  excavatorHourly: 165,
  bobcatHourly: 140,
  tipperHourly: 150,
  disposalPerTonne: 38,
  disposalContaminatedPerTonne: 145,
  deliveryBaseM3: 22,
  labourHourly: 75,
  defaultMarginPct: 22,
}

/** Default finished thickness (mm) by job type. */
export const DEFAULT_THICKNESS: Record<JobType, number> = {
  driveway: 100,
  slab: 100,
  'shed-slab': 125,
  'path-footpath': 85,
  patio: 100,
  'retaining-wall': 200,
  excavation: 0,
  paving: 50,
  turf: 0,
  other: 100,
}

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  driveway: 'Driveway',
  slab: 'Concrete Slab',
  'shed-slab': 'Shed Slab',
  'path-footpath': 'Path / Footpath',
  patio: 'Patio / Alfresco',
  'retaining-wall': 'Retaining Wall',
  excavation: 'Excavation / Earthworks',
  paving: 'Paving',
  turf: 'Turf / Landscaping',
  other: 'Other',
}

export const FINISH_LABELS: Record<Finish, string> = {
  plain: 'Plain / Grey',
  broom: 'Broom Finish',
  'exposed-aggregate': 'Exposed Aggregate',
  coloured: 'Coloured / Oxide',
  stencil: 'Stencil',
  polished: 'Polished',
  pavers: 'Pavers',
  turf: 'Turf',
  na: 'N/A',
}

export const SOIL_LABELS: Record<SoilType, string> = {
  unknown: 'Unknown',
  sand: 'Sand',
  clay: 'Clay',
  'reactive-clay': 'Reactive / Black Soil',
  rock: 'Rock',
  fill: 'Uncontrolled Fill',
  loam: 'Loam / Topsoil',
}

/**
 * Location intelligence — remote AU towns carry serious concrete freight,
 * travel and accommodation loadings that contractors routinely forget.
 * multiplier applies to delivery & travel; supplyLoad adds $/m³ to concrete.
 */
export interface LocationProfile {
  name: string
  state: string
  /** Delivery / travel multiplier vs metro. */
  multiplier: number
  /** Extra concrete supply loading $/m³ for remote batching. */
  supplyLoadM3: number
  /** Round-trip travel time hrs the crew burns getting there. */
  travelHrs: number
  remote: boolean
  note: string
}

export const LOCATIONS: LocationProfile[] = [
  { name: 'Brisbane', state: 'QLD', multiplier: 1.0, supplyLoadM3: 0, travelHrs: 0.5, remote: false, note: 'Metro batching, easy supply.' },
  { name: 'Gold Coast', state: 'QLD', multiplier: 1.0, supplyLoadM3: 0, travelHrs: 0.5, remote: false, note: 'Metro batching.' },
  { name: 'Townsville', state: 'QLD', multiplier: 1.15, supplyLoadM3: 18, travelHrs: 1, remote: false, note: 'Regional centre, mild freight loading.' },
  { name: 'Cairns', state: 'QLD', multiplier: 1.2, supplyLoadM3: 25, travelHrs: 1, remote: false, note: 'Far north, wet-season risk.' },
  { name: 'Mount Isa', state: 'QLD', multiplier: 1.6, supplyLoadM3: 95, travelHrs: 3, remote: true, note: 'Remote mining town — concrete freight + travel hammer the price.' },
  { name: 'Mackay', state: 'QLD', multiplier: 1.15, supplyLoadM3: 20, travelHrs: 1, remote: false, note: 'Regional centre.' },
  { name: 'Rockhampton', state: 'QLD', multiplier: 1.15, supplyLoadM3: 18, travelHrs: 1, remote: false, note: 'Regional centre.' },
  { name: 'Sydney', state: 'NSW', multiplier: 1.0, supplyLoadM3: 0, travelHrs: 0.6, remote: false, note: 'Metro, traffic eats labour hours.' },
  { name: 'Broken Hill', state: 'NSW', multiplier: 1.5, supplyLoadM3: 80, travelHrs: 2.5, remote: true, note: 'Remote — limited batching, big freight.' },
  { name: 'Melbourne', state: 'VIC', multiplier: 1.0, supplyLoadM3: 0, travelHrs: 0.6, remote: false, note: 'Metro, reactive clay common.' },
  { name: 'Perth', state: 'WA', multiplier: 1.05, supplyLoadM3: 5, travelHrs: 0.6, remote: false, note: 'Metro, sandy soils.' },
  { name: 'Port Hedland', state: 'WA', multiplier: 1.7, supplyLoadM3: 110, travelHrs: 3, remote: true, note: 'Pilbara remote — extreme freight + heat constraints.' },
  { name: 'Kalgoorlie', state: 'WA', multiplier: 1.5, supplyLoadM3: 75, travelHrs: 2.5, remote: true, note: 'Goldfields — remote supply.' },
  { name: 'Darwin', state: 'NT', multiplier: 1.35, supplyLoadM3: 55, travelHrs: 1, remote: true, note: 'Top End — monsoon risk, freight loading.' },
  { name: 'Alice Springs', state: 'NT', multiplier: 1.65, supplyLoadM3: 100, travelHrs: 3, remote: true, note: 'Red Centre — extreme remoteness.' },
  { name: 'Adelaide', state: 'SA', multiplier: 1.0, supplyLoadM3: 0, travelHrs: 0.6, remote: false, note: 'Metro, reactive clay common.' },
  { name: 'Hobart', state: 'TAS', multiplier: 1.1, supplyLoadM3: 10, travelHrs: 0.7, remote: false, note: 'Regional, sloping sites common.' },
]

/** Fuzzy-match a free-text location against the known profiles. */
export function resolveLocation(text: string): LocationProfile {
  const t = text.trim().toLowerCase()
  if (t) {
    const hit = LOCATIONS.find((l) => t.includes(l.name.toLowerCase()))
    if (hit) return hit
  }
  // Unknown regional default — assume a mild loading rather than metro.
  return {
    name: text.trim() || 'Unknown location',
    state: '—',
    multiplier: 1.12,
    supplyLoadM3: 15,
    travelHrs: 1,
    remote: false,
    note: 'Unknown town — assumed light regional loading. Confirm the nearest batch plant.',
  }
}

/** Approx tonnes of spoil per m³ excavated (mixed soil ≈ 1.8 t/m³). */
export const SPOIL_TONNES_PER_M3 = 1.8
