// The read-only input contract handed to the guardian, AFTER Validation and
// BEFORE send/export. Decoupled from the host app: no app enums, no pipeline types.
// `reviewContractVersion` pins the shape so producers and the guardian agree.

import type { DeepReadonly, OperatorId, ReviewedAmount } from './branded'
import type { ReviewItem } from './review-items'
import type { SiteConditions } from './site-conditions'

export const VALIDATION_STATUSES = ['PASS', 'WARN', 'BLOCK'] as const
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number]

/** A single upstream Validation Engine finding, mirrored into the guardian's shape. */
export interface ValidationFindingInput {
  severity: 'info' | 'warn' | 'block'
  code: string
  detail: string
}

/** Decoupled result of the Validation Engine that ran before the guardian. */
export interface ValidationSummary {
  status: ValidationStatus
  findings: ReadonlyArray<ValidationFindingInput>
}

/** Reviewed monetary figures. Opaque amounts — read via amountValue(). */
export interface QuoteTotals {
  subtotalExGst: ReviewedAmount
  gst: ReviewedAmount
  total: ReviewedAmount
  marginPct: number
}

/** A minimal, read-only snapshot of the quote the guardian may reason over. */
export interface QuoteSnapshot {
  quoteId: string
  trade?: string
  jobType?: string
  totals?: QuoteTotals
  scopeNote?: string
  /**
   * M2A additive: pre-classified quote items (see review-items.ts). Optional —
   * M1-shaped requests omit it and remain valid. `undefined` means "no
   * structured item data supplied"; `[]` means "supplied, no items".
   */
  reviewItems?: ReadonlyArray<ReviewItem>
}

/** The un-frozen shape; the exported contract is its DeepReadonly form. */
export interface QuoteReviewRequestShape {
  /** Pins the contract version. M1 is version 1; M2A adds only optional fields, so the version is unchanged. */
  reviewContractVersion: 1
  quoteId: string
  operatorId: OperatorId
  quote: QuoteSnapshot
  validation: ValidationSummary
  /**
   * M2A additive: structured site conditions (see site-conditions.ts). Optional —
   * M1-shaped requests omit it and remain valid. Absent = "no signal", never false.
   */
  siteConditions?: SiteConditions
}

/** The review request contract — deeply read-only. */
export type QuoteReviewRequest = DeepReadonly<QuoteReviewRequestShape>
