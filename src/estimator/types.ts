// TerrainPro Estimating Engine — quote object, Business Intelligence schema,
// and the repository interface. The engine is stateless and DB-agnostic: it
// reads BI through BIRepository and accumulates a single quote object as it
// flows down the 10-stage pipeline. Each engine enriches, never overwrites.

/* ════════════════ shared atoms ════════════════ */
export type Trade = 'earthworks' | 'concreting' | 'landscaping'
export type InputSource = 'measured' | 'stated' | 'eyeballed' | 'unknown'
export type MaterialClass = 'sand' | 'gravel' | 'common_earth' | 'clay' | 'topsoil' | 'rock' | 'fill'
export type MachineClass = '1.7t' | '5t' | '8t' | '13t' | '20t'
export type Access = 'open' | 'chute' | 'barrow' | 'pump' | 'restricted'
export type QuoteType = 'Fixed' | 'Estimate' | 'Indicative'
export type ConfidenceTier = 'high' | 'medium' | 'low'
export type DayType = 'weekday' | 'saturday' | 'sunday'
export type ValidationStatus = 'PASS' | 'WARN' | 'BLOCK'
export type Severity = 'info' | 'warn' | 'block'

/* ════════════════ Business Intelligence (per contractor) ════════════════ */
export interface LabourRate {
  role: string
  cost: number
  preferredSell: number
  minimumSell: number
  targetMargin: number
  overtimeMultiplier: number
  saturdayMultiplier: number
  sundayMultiplier: number
  minimumBillableHours: number
}
export interface PlantRate {
  name: string
  type: MachineClass
  region?: string
  cost: number
  preferredSell: number
  minimumSell: number
  targetMargin: number
  fuelIncluded: boolean
  operatorIncluded: boolean
  minimumHireHrs: number
  minimumCharge: number
  requiresFloat: boolean
  floatCost: number
  attachments: string[]
  productivity: { material_m3_hr?: Partial<Record<MaterialClass, number>> }
}
export interface MaterialRate {
  name: string
  supplier?: string
  rate: number // single rate = COST; markup applied by Commercial
  unit: 'm3' | 'tonne' | 'm2' | 'm' | 'each' | 'bag'
  wastePct?: number
  compactionAllowance?: number
  minimumOrder?: number
  smallLoadFee?: number
  deliveryCharge?: number
  regionalFreight?: number
}
export interface SubcontractorRate {
  type: string
  billing: ('hourly' | 'per_load' | 'per_tonne')[]
  perLoad?: number
  hourly?: number
  perTonne?: number
  minimumCharge?: number
  weekendRate?: number
}
export interface RegionRate {
  supplier: string
  region: string
  effectiveDate: string
  rate: number
  deliveryZone?: string
  freightLoading?: number
}
export interface PricingPolicy {
  roundMachineTime: number
  minimumCallout: number
  minimumJobValue: number
  allowNegativeMargin: boolean
  allowFixedPriceBelowConfidence: number
  materialMarkup: number
  subcontractMarkup: number
  fuelRecovery: 'automatic' | 'manual'
  travelRecovery: 'automatic' | 'manual'
  floatRecovery: 'automatic' | 'manual'
}
export interface BusinessHistory {
  productivity: { job: string; machine: string; material: string; estHrs: number; actualHrs: number }[]
  suppliers: { supplier: string; material: string; date: string; rate: number }[]
  customers: { customer: string; jobs: number; avgMargin: number }[]
  winLoss: { quoteId: string; outcome: 'won' | 'lost'; confidence: number }[]
  actualVsEstimated: { hours: number[]; materials: number[]; margin: number[] }
}
export interface BusinessIntelligence {
  contractorId: string
  region: string
  labour: LabourRate[]
  plant: PlantRate[]
  materials: MaterialRate[]
  subcontractors: SubcontractorRate[]
  regions: RegionRate[]
  pricingPolicy: PricingPolicy
  history: BusinessHistory
}

/** Repository interface — the only seam between the engine and storage. */
export interface BIRepository {
  getProfile(contractorId: string): BusinessIntelligence
}

/* ════════════════ Quote object (accumulates down the pipeline) ════════════════ */
export interface RawInput {
  userText: string
  // Values are mostly primitives; `__sources` carries per-field FieldSource.
  answers: Record<string, unknown>
}
export interface FieldSource {
  source: InputSource
  confidence: number
}
export interface RiskMetadata {
  siteVisit: boolean
  groundConfirmed: boolean
  servicesLocated: boolean
}
export interface DerivedFlags {
  producesSpoil: boolean
  requiresImport: boolean
  precisionJob: boolean
  servicesCritical: boolean
}
/** Dollar-free physical quantities (LAW 1). */
export interface Quantities {
  cutVolumeBankM3?: number
  spoilLooseM3?: number
  truckLoads?: number
  machineHours?: number
  operatorHours?: number
  roadbaseTonnes?: number
  compactionPasses?: number
  concreteVolumeM3?: number
  meshSheets?: number
  areaM2?: number
  // concreting (dollar-free physical quantities)
  placeFinishHours?: number // concreter on-site labour (place, finish, form, saw)
  formworkLm?: number // linear metres of edge formwork
  sawCutLm?: number // linear metres of control-joint saw cutting
  subBaseTonnes?: number // compacted granular sub-base under the slab
  pierCount?: number // number of bored piers
  footingConcreteM3?: number // footing + pier concrete (subset of concreteVolumeM3)
  reoBarLm?: number // footing/pier reinforcing bar
}
export interface RatedLine {
  item: string
  qty: number
  unit: string
  cost: number
  charge: number
  trigger: string
  kind: 'labour' | 'plant' | 'material' | 'subbie' | 'fee'
}
export interface Rated {
  lines: RatedLine[]
  costTotal: number
  chargeTotal: number
}
export interface HiddenCost {
  item: string
  trigger: string
}
export interface ValidationFinding {
  severity: Severity
  check: string
  detail: string
}
export interface Commercial {
  labourCharge: number
  plantCharge: number
  materialCost: number
  materialSell: number
  subbieCost: number
  subbieSell: number
  baseSell: number
  contingencyAmount: number
  costTotal: number
  sellTotal: number
  marginPct: number
  realisedMargin: number
  gst: number
  totalIncGst: number
  valid: boolean
}
export interface ValidationResult {
  status: ValidationStatus
  confidence: number
  findings: ValidationFinding[]
  recommendation: string
  blockSend: boolean
}
export interface AuditRow {
  engine: string
  rule: string
  added?: string
  result?: string
}
export interface ClientQuote {
  scope: string
  inclusions: string[]
  exclusions: string[]
  assumptions: string[]
  quoteType: QuoteType
  confidence: number
  price: number | null
  priceText: string
  sendable: boolean
}
export interface InternalSheet {
  lines: RatedLine[]
  costTotal: number
  sellTotal: number
  contingencyAmount: number
  marginPct: number
  realisedMargin: number
  gst: number
  totalIncGst: number
  flags: string[]
}

export interface Quote {
  rawInput: RawInput
  trade?: Trade
  jobType?: string
  inputs: Record<string, string | number | boolean>
  inputSources: Record<string, FieldSource>
  riskMetadata: RiskMetadata
  derived: DerivedFlags
  missingInputs: string[]
  quantities: Quantities
  rated?: Rated
  hiddenCosts: HiddenCost[]
  confidence?: number
  confidenceTier?: ConfidenceTier
  quoteType?: QuoteType
  contingencyPct?: number
  riskFlags: string[]
  assumptions: string[]
  variationTriggers: string[]
  lockFixedPrice?: boolean
  commercial?: Commercial
  validation?: ValidationResult
  clientQuote?: ClientQuote
  internalSheet?: InternalSheet
  engineAudit: AuditRow[]
}

/** Fresh quote object from raw input. */
export function initQuote(rawInput: RawInput): Quote {
  return {
    rawInput,
    inputs: {},
    inputSources: {},
    riskMetadata: { siteVisit: false, groundConfirmed: false, servicesLocated: false },
    derived: { producesSpoil: false, requiresImport: false, precisionJob: false, servicesCritical: false },
    missingInputs: [],
    quantities: {},
    hiddenCosts: [],
    riskFlags: [],
    assumptions: [],
    variationTriggers: [],
    engineAudit: [],
  }
}

export function audit(q: Quote, row: AuditRow): void {
  q.engineAudit.push(row)
}
