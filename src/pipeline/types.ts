// TerrainPro quoting pipeline — PRODUCT-LOGIC CONTRACT (schema).
//
// One-way pipeline; each stage emits its OWN immutable result type:
//   QuoteContext --Quantity--> QuantityResult --Rate--> RateResult
//     --Commercial--> CommercialResult --Validation--> ValidationResult
//
// BusinessIntelligence is the single source of truth. Engines are pure,
// framework-agnostic functions (see ./*.ts). UI calls them, never the reverse.

/* ════════════════ shared atoms ════════════════ */
export type Unit = 'm3' | 'm2' | 't' | 'hr' | 'ea'
export type SoilType = 'sand' | 'clay' | 'reactive-clay' | 'rock' | 'fill' | 'loam' | 'unknown'
export type ScopeCategory =
  | 'excavation'
  | 'cartage'
  | 'disposal'
  | 'plant'
  | 'labour'
  | 'concrete'
  | 'reo'
  | 'prep'
  | 'paving'
  | 'drainage'
  | 'mobilisation'
  | 'traffic-control'
  | 'survey-setout'
  | 'other'

/* ════════════════ BusinessIntelligence (source of truth) ════════════════ */
export interface PlantRate {
  machineId: string
  hourlyCost: number // what the machine costs you per hour (cost, pre-margin)
}
export interface LabourRate {
  roleId: string
  costPerHour: number
}
export interface MaterialRate {
  materialId: string
  unit: Unit
  costRate: number // $ per unit
}
export interface DisposalRate {
  tipId: string
  perTonne: number
  material?: string // clean fill / contaminated / mixed
}

export interface Rates {
  plantRates: Record<string, PlantRate>
  labourRates: Record<string, LabourRate>
  materialRates: Record<string, MaterialRate>
  disposalRates: Record<string, DisposalRate>
}

export interface Productivity {
  /** Dig output m³/hr keyed by soil type. */
  digRatesM3PerHr: Record<SoilType, number>
  /** Swell (bulking) factor loose:bank keyed by soil type. */
  swellFactors: Record<SoilType, number>
  /** In-situ density t/m³ (bank) keyed by soil type — for disposal tonnage. */
  bulkingFactors: Record<SoilType, number>
  /** Cartage truck payload (tonnes) for load counts. */
  truckPayloadTonnes: number
}

export interface PlantItem {
  id: string
  name: string
  /** Productivity baseline (output per hour) for this machine. */
  productivityDefault: number
  productivityUnit: string
  hourlyCost: number
}

export interface Supplier {
  id: string
  name: string
  materialIds: string[]
}

export interface RoundingRule {
  mode: 'none' | 'nearest'
  nearest: number // e.g. 10 -> round to nearest $10
}

export interface PricingPolicy {
  targetMargin: number // 0..1, margin on sell
  marginFloor: number // hard floor; below this Validation FAILS
  overheadPercent: number // 0..1 of cost
  riskContingencyDefault: number // 0..1 of cost
  minimumQuoteValue: number
  rounding: RoundingRule
}

export interface PastJob {
  id: string
  date: string
  jobType: string
  volumeM3: number
  quotedTotal: number
  actualTotal?: number
  /** Benchmark $/m³ (sell) used by Validation. */
  costPerM3: number
}

export interface BusinessIntelligence {
  rates: Rates
  productivity: Productivity
  machines: PlantItem[]
  suppliers: Supplier[]
  pricingPolicy: PricingPolicy
  jobHistory: PastJob[]
}

/* ════════════════ QuoteContext — PHYSICAL INPUTS ONLY ════════════════ */
export interface SiteArea {
  id: string
  label: string
  areaM2: number
}
export interface SiteDepth {
  id: string
  label: string
  depthMm: number
}
export interface SiteVolume {
  id: string
  label: string
  volumeM3: number
}
export type AccessConstraint = 'tight' | 'sloped' | 'overhead' | 'restricted-hours' | 'wet' | 'none'

export interface SiteWalkthrough {
  areas: SiteArea[]
  depths: SiteDepth[]
  volumesInput: SiteVolume[]
  soilType: SoilType
  accessConstraints: AccessConstraint[]
}

/** A scope item is a physical descriptor — NO rates, NO money. */
export interface ScopeItem {
  id: string
  description: string
  category: ScopeCategory
  quantity?: number
  unit?: Unit
  /** Optional refs into BI (machine/material/role/tip) used later by RateEngine. */
  machineId?: string
  materialId?: string
  roleId?: string
  tipId?: string
  soilType?: SoilType
}

export interface QuoteContext {
  site: SiteWalkthrough
  scopeItems: ScopeItem[]
}

/* ════════════════ Stage 1: QuantityResult — PHYSICAL ONLY ════════════════ */
export interface QuantityLine {
  id: string
  description: string
  quantity: number
  unit: Unit
  category: ScopeCategory
  /** Optional BI refs carried through for rating (not money). */
  machineId?: string
  materialId?: string
  roleId?: string
  tipId?: string
}
export interface CutFillVolumes {
  swellApplied: true
  bankM3: number // in-situ
  looseM3: number // after swell
}
export interface PlantHours {
  machineId: string
  hours: number
}
export interface QuantityDerived {
  cutFillVolumes: CutFillVolumes
  disposalTonnes: number
  plantHours: PlantHours[]
}
export interface QuantityResult {
  lines: QuantityLine[]
  derived: QuantityDerived
}

/* ════════════════ Stage 2: RateResult — COST, PRE-MARGIN ════════════════ */
export interface CostedLine {
  quantityLineId: string
  quantity: number
  unit: Unit
  unitRate: number
  lineCost: number
}
export interface RateSnapshotEntry {
  kind: 'plant' | 'labour' | 'material' | 'disposal' | 'fallback'
  refId: string
  unitRate: number
  unit: Unit
}
export interface RateResult {
  costedLines: CostedLine[]
  totalCost: number
  /** Immutable record of the rates USED at calc time. NOT a rate store. */
  rateSnapshot: RateSnapshotEntry[]
}

/* ════════════════ Stage 3: CommercialResult — SELL PRICE ════════════════ */
export interface PricedLine {
  lineId: string
  cost: number
  margin: number
  sell: number
}
export interface RiskInputs {
  /** Override policy default (0..1 of cost). */
  riskContingencyPercent?: number
  overheadPercentOverride?: number
  /** Identified risk flags from the Hidden Cost + Risk screen. */
  flags?: string[]
}
export interface CommercialResult {
  pricedLines: PricedLine[]
  overhead: number
  riskContingency: number
  marginTotal: number
  quotedTotal: number
}

/* ════════════════ Stage 4: ValidationResult — THE GATE ════════════════ */
export type ValidationStatus = 'pass' | 'warn' | 'fail'
export type Severity = 'info' | 'warn' | 'fail'
export interface ValidationCheck {
  rule: string
  severity: Severity
  message: string
  lineId?: string
}
export interface ValidationResult {
  status: ValidationStatus
  checks: ValidationCheck[]
}

/* ════════════════ Compile-time invariant: NO MONEY upstream ════════════════
 * QuoteContext and QuantityResult must never carry a monetary field. This is
 * enforced structurally: adding a money-named key anywhere in those types makes
 * AssertNoMoney resolve to an object, and the `= true` assignments below fail to
 * compile. (Lint/typecheck fails — exactly as the contract requires.) */
type Prim = string | number | boolean | null | undefined
type DeepKeys<T> = T extends Prim
  ? never
  : T extends ReadonlyArray<infer U>
    ? DeepKeys<U>
    : { [K in keyof T]-?: (K & string) | DeepKeys<T[K]> }[keyof T]

type MoneyKey =
  | 'cost'
  | 'lineCost'
  | 'unitRate'
  | 'rate'
  | 'unitCost'
  | 'price'
  | 'sell'
  | 'margin'
  | 'overhead'
  | 'contingency'
  | 'riskContingency'
  | 'quotedTotal'
  | 'totalCost'
  | 'amount'
  | 'dollars'
  | 'charge'
  | 'chargePerHour'
  | 'costPerHour'
  | 'hourlyCost'
  | 'perTonne'
  | 'costRate'

type MoneyInside<T> = Extract<DeepKeys<T>, MoneyKey>
export type AssertNoMoney<T> = [MoneyInside<T>] extends [never] ? true : { __MONEY_FIELD_FOUND__: MoneyInside<T> }

// These compile ONLY while the upstream types stay money-free.
const _noMoneyInContext: AssertNoMoney<QuoteContext> = true
const _noMoneyInQuantity: AssertNoMoney<QuantityResult> = true
void _noMoneyInContext
void _noMoneyInQuantity
