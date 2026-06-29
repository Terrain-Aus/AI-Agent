// TerrainPro — binding domain contract.
//
// BusinessIntelligence is the single source of truth. The pipeline is one-way:
//   BI → Quantity → Rate → Commercial → Validation → Final
// Four non-negotiable rules are enforced in the TYPE SYSTEM (see R1–R4 below),
// not by convention.

/* ───────────────────────── primitives ───────────────────────── */
export type Money = number // AUD; rounding governed by PricingPolicy
export type Markup = number // fraction, 0.38 === 38%
export type ISODate = string
export type RecoveryMode = 'automatic' | 'manual' | 'none'
export type DataSource = 'default' | 'manual' | 'learned'
export type MaterialUnit = 'm3' | 'tonne' | 'm2' | 'lm' | 'each' | 'bag' | 'litre'
export type ProductionUnit = 'm3/hr' | 'm2/hr' | 'lm/hr' | 't/hr' | 'each/hr'
export interface ContactInfo {
  phone?: string
  email?: string
}

// R1: physical quantity, branded so a plain number (money included) cannot be
// assigned without qty().
export type Quantity = number & { readonly __unit: 'physical' }
export const qty = (n: number): Quantity => n as Quantity

/* ── pricing primitive (cost/sell split). Preferred sell is DERIVED ── */
export interface Pricing {
  cost: Money
  targetMarkup?: Markup // falls back to BusinessMeta.defaultTargetMarkup
  minimumCharge: Money // hard floor
  pinnedCharge?: Money // active only when isOverridden
  isOverridden: boolean // pinnedCharge wins over derived preferred
}

/** pinned if overridden, else cost*(1+(targetMarkup??fallback)), floored at minimumCharge. */
export function resolveSellPrice(p: Pricing, fallbackMarkup: Markup): Money {
  const derived = p.cost * (1 + (p.targetMarkup ?? fallbackMarkup))
  const base = p.isOverridden && p.pinnedCharge != null ? p.pinnedCharge : derived
  return Math.max(base, p.minimumCharge)
}
export function resolveMargin(cost: Money, sell: Money): Markup {
  return sell <= 0 ? 0 : (sell - cost) / sell
}

/* ───────────────── BusinessIntelligence (editable source of truth) ───────────────── */
export interface BusinessMeta {
  businessName: string
  baseRegionId: string
  currency: 'AUD'
  defaultTargetMarkup: Markup
  updatedAt: ISODate
}
export interface PricingPolicy {
  roundMachineTime: number
  minimumCallout: number
  minimumJobValue: Money
  allowNegativeMargin: boolean
  allowFixedPriceBelowConfidence: number
  materialMarkup: Markup
  subcontractMarkup: Markup
  fuelRecovery: RecoveryMode
  travelRecovery: RecoveryMode
  floatRecovery: RecoveryMode
}
export interface RegionalModifiers {
  labourMultiplier: number
  plantMultiplier: number
  materialMultiplier: number
  travelDefaultKm?: number
  accommodationPerNight?: Money
}
export interface Region {
  id: string
  name: string
  isRemote: boolean
  modifiers: RegionalModifiers
}
export interface RegionalPriceOverride {
  id: string
  regionId: string
  targetType: 'labour' | 'plant' | 'material' | 'attachment'
  targetId: string
  pricing: Pricing
}
export interface LabourRole {
  id: string
  name: string
  pricing: Pricing
  onCostsIncluded: boolean
  chargeUnit: 'hour' | 'day'
}
export interface FloatConfig {
  applies: boolean
  pricing?: Pricing
  recoveryMode: RecoveryMode
}
export type HireMode = 'dry' | 'wet'
export interface PlantHire {
  offered: HireMode[] // offered non-empty
  default: HireMode // default in offered
}
export interface FuelConfig {
  burnLitresPerHour: number
  recoveryMode?: RecoveryMode
  costPerLitre?: Money // stored figure, not a feed
}
export interface StandbyConfig {
  applies: boolean
  pricing?: Pricing
}
export interface Attachment {
  id: string
  name: string
  pricing: Pricing
}
export interface AttachmentLink {
  attachmentId: string
  isDefault: boolean
}
export interface PlantItem {
  id: string
  name: string
  category: string
  sizeClass?: string
  pricing: Pricing // DRY hire (machine only). Wet hire = machine + operator, composed at projection
  hire: PlantHire
  requiresOperator: boolean
  defaultOperatorRoleId?: string // -> LabourRole.id
  fuel?: FuelConfig
  float: FloatConfig
  standby?: StandbyConfig
  minimumHireHours?: number
  attachments: AttachmentLink[]
  isPreferred: boolean
}
export interface Material {
  id: string
  name: string
  unit: MaterialUnit
  pricing: Pricing
  defaultSupplierId?: string
  wastageFactor?: number
}
export interface Supplier {
  id: string
  name: string
  trades: string[]
  regionIds: string[]
  leadTimeDays?: number
  reliabilityScore?: number
  contact?: ContactInfo
}
export interface ProductionRate {
  id: string
  taskCode: string
  description: string
  unit: ProductionUnit
  rate: number
  basis: 'machine' | 'crew' | 'labour'
  appliesToPlantCategory?: string
  appliesToCrewId?: string
  regionId?: string
  source: DataSource
  sampleSize?: number
}
export interface CrewMember {
  roleId: string
  count: number
}
export interface CrewPlant {
  plantId: string
  count: number
}
export interface CrewConfig {
  id: string
  name: string
  members: CrewMember[]
  plant: CrewPlant[]
  isPreferred: boolean
}
export interface EstimateSnapshot {
  hours: number
  materialCost: Money
  margin: Markup
  total: Money
}
export interface ActualSnapshot {
  hours: number
  materialCost: Money
  margin: Markup
  total: Money
}
export interface VarianceSummary {
  hoursDelta: number
  hoursDeltaPct: number
  materialDelta: Money
  marginDelta: Markup
}
export interface JobOutcome {
  id: string
  jobId: string
  customerId?: string
  regionId?: string
  completedAt: ISODate
  estimated: EstimateSnapshot
  actual: ActualSnapshot
  variance: VarianceSummary
}
export interface CustomerRecord {
  id: string
  name: string
  regionId?: string
  jobsWon: number
  jobsLost: number
  totalRevenue: Money
  averageMarginAchieved?: Markup
  paymentReliability?: number
  notes?: string
}
export interface WinLossRecord {
  id: string
  quoteId: string
  customerId?: string
  regionId?: string
  outcome: 'won' | 'lost' | 'pending'
  quotedTotal: Money
  competitorTotal?: Money
  reason?: string
  decidedAt?: ISODate
}
export interface SupplierPricePoint {
  supplierId: string
  materialId: string
  pricePerUnit: Money
  observedAt: ISODate
}
export interface BusinessHistory {
  jobOutcomes: JobOutcome[]
  customers: CustomerRecord[]
  winLoss: WinLossRecord[]
  supplierPrices: SupplierPricePoint[]
}
export interface BusinessIntelligence {
  meta: BusinessMeta
  pricingPolicy: PricingPolicy
  regions: Region[]
  labour: LabourRole[]
  plant: PlantItem[]
  attachments: Attachment[]
  materials: Material[]
  suppliers: Supplier[]
  productionRates: ProductionRate[]
  crews: CrewConfig[]
  regionalOverrides: RegionalPriceOverride[]
  history: BusinessHistory
}

/* ──────────── Rate-book projection (seam between BI and the Rate Engine) ──────────── */
export interface ResolvedFloatRate {
  cost: Money
  sell: Money
  recoveryMode: RecoveryMode
}
export interface ResolvedStandbyRate {
  cost: Money
  sell: Money
}
export interface ResolvedFuelRate {
  burnLitresPerHour: number
  costPerLitre?: Money
  recoveryMode: RecoveryMode
}
export interface PlantRateDetail {
  hire: PlantHire
  requiresOperator: boolean
  defaultOperatorRoleId?: string
  minimumHireHours?: number
  float?: ResolvedFloatRate
  standby?: ResolvedStandbyRate
  fuel?: ResolvedFuelRate
  attachments: AttachmentLink[]
}
export interface RateBookEntry {
  itemId: string
  kind: 'plant' | 'labour' | 'material' | 'attachment'
  name: string
  regionId: string
  cost: Money
  sell: Money
  minimumCharge: Money
  origin: 'base' | 'regionalOverride'
  plant?: PlantRateDetail
}
export interface RateBook {
  generatedFrom: ISODate
  entries: RateBookEntry[]
  byItemId: Record<string, RateBookEntry[]>
}
export type ProjectRateBook = (bi: BusinessIntelligence) => RateBook

/* ───────────────── Rate Engine I/O ───────────────── */
export interface RateQuery {
  regionId: string
  date?: ISODate
  hours?: number
  plantId?: string
  labourRoleId?: string
  materialId?: string
  crewId?: string
  requiresOperator?: boolean
  attachmentIds?: string[]
  quantity?: number
}
export interface RateComponent {
  kind: 'plant' | 'operator' | 'float' | 'fuel' | 'attachment' | 'material' | 'regionalAdjustment' | 'minimumTopUp'
  label: string
  amount: Money
}
export interface RateBreakdown {
  base: Money
  components: RateComponent[]
  subtotal: Money
}
export interface ResolvedFloat {
  cost: Money
  sell: Money
  recoveryMode: RecoveryMode
} // mirror ResolvedFloatRate
export interface ResolvedFuel {
  litres: number
  cost: Money
  charge: Money
  recoveryMode: RecoveryMode
}
export interface ResolvedAttachment {
  attachmentId: string
  label: string
  cost: Money
  charge: Money
}
export interface ResolvedOperator {
  roleId: string
  hours: number
  cost: Money
  charge: Money
}
export interface ResolvedSupplier {
  supplierId: string
  name: string
  leadTimeDays?: number
}
export interface RateResolutionTrace {
  usedRegionalOverride: boolean
  appliedRegionMultiplier: number
  productionRateSource?: DataSource
  notes: string[]
}
export interface RateResult {
  lineLabel: string
  regionId: string
  hours?: number
  cost: RateBreakdown
  charge: RateBreakdown
  minimumHireHours?: number
  appliedMinimum: boolean
  float?: ResolvedFloat
  fuel?: ResolvedFuel
  attachments: ResolvedAttachment[]
  operator?: ResolvedOperator
  supplier?: ResolvedSupplier
  source: RateResolutionTrace
}
// R2: pure, queries the projection, never BI
export type ResolveRate = (book: RateBook, query: RateQuery) => RateResult

/* ───────────────── Pipeline / QuoteContext ───────────────── */
export interface RawInput {
  jobDescription: string
  trade?: string
  attachments?: string[]
  siteNotes?: string
  capturedFields: Record<string, string | number | boolean>
}
export interface TradeTask {
  taskCode: string
  label: string
  productionRateId?: string
}
export interface TradeBreakdown {
  detectedTrade: string
  tasks: TradeTask[]
}
export interface QuantityItem {
  readonly taskCode: string
  readonly unit: string
  readonly quantity: Quantity
  readonly assumptions: readonly string[]
  readonly derivedHours?: Quantity
} // R1
export interface QuantityResult {
  readonly items: readonly QuantityItem[]
}
export interface RatedLine {
  query: RateQuery
  result: RateResult
}
export interface RiskFactor {
  code: string
  severity: 'low' | 'medium' | 'high'
  description: string
  impact?: Markup
}
export interface RiskAssessment {
  confidence: number // INPUT certainty
  factors: RiskFactor[]
  contingencyMarkup: Markup
}
export interface HiddenCostItem {
  code: string
  label: string
  cost: Money
  recoveryMode: RecoveryMode
  recovered: boolean
}
export interface HiddenCostBreakdown {
  items: HiddenCostItem[]
  total: Money
}
export interface CommercialAdjustment {
  readonly label: string
  readonly amount: Money
  readonly kind: 'discount' | 'uplift' | 'rounding' | 'contingency'
}
export interface CommercialResult {
  readonly subtotalCost: Money
  readonly subtotalCharge: Money
  readonly appliedMarkup: Markup
  readonly achievedMargin: Markup
  readonly hiddenCosts: HiddenCostBreakdown
  readonly adjustments: readonly CommercialAdjustment[]
  readonly total: Money
} // owns risk + hidden cost
export type ValidationSeverity = 'info' | 'warning' | 'blocking'
export type ValidationRecommendation = 'send' | 'review' | 'site_visit_required' | 'block_send'
export type PipelineStage = 'quantity' | 'rate' | 'commercial' | 'validation'
export interface ValidationCheck {
  readonly code: string
  readonly severity: ValidationSeverity
  readonly message: string
  readonly field?: string
  readonly remediationStage?: PipelineStage // flag-back channel
  readonly autoFixable: boolean
}
export interface SendDecision {
  gate: 'allow' | 'block'
  overridden: boolean
  overriddenBy?: string
  overrideReason?: string
  overriddenAt?: ISODate
}
export interface ValidationResult {
  readonly completenessConfidence: number // != risk confidence
  readonly checks: readonly ValidationCheck[]
  readonly blockingCount: number
  readonly recommendation: ValidationRecommendation
  readonly decision: SendDecision
}
export interface FinalLineItem {
  label: string
  quantity?: number
  unit?: string
  charge: Money
}
export interface FinalQuote {
  total: Money
  validUntil?: ISODate
  lineItems: FinalLineItem[]
  generatedAt: ISODate
  sentAgainstAdvice: boolean
}
export interface QuoteContext {
  id: string
  createdAt: ISODate
  regionId: string
  customerId?: string
  rawInput: RawInput
  trade?: TradeBreakdown
  quantities?: QuantityResult
  rates?: RatedLine[]
  risk?: RiskAssessment
  commercial?: CommercialResult
  validation?: ValidationResult
  final?: FinalQuote
}
// R4 gate: validation must be present.
export type ValidatedQuoteContext = QuoteContext & { readonly validation: ValidationResult }

/* ───────────────── Engine contracts (the spine) ───────────────── */
export type RunTrade = (raw: RawInput) => TradeBreakdown
export type RunQuantity = (ctx: QuoteContext) => QuantityResult // R1
export type RunCommercial = (rates: RateResult, policy: PricingPolicy, risk: RiskAssessment) => CommercialResult // R3
export type RunValidation = (ctx: QuoteContext, policy: PricingPolicy) => ValidationResult
export type BuildFinalQuote = (ctx: ValidatedQuoteContext) => FinalQuote // R4
