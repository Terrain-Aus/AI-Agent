// Input contract for the Apprentice guardian.
//
// This is a DECOUPLED snapshot. The host application maps its own quote /
// validation objects into this DTO at the call site (in a later milestone's
// transport layer). The guardian imports NOTHING from the app — so it stays
// isolated and portable to Cloud Run. No app enums, no pipeline internals.

/** Overall outcome of the Validation Engine that ran before the guardian. */
export const VALIDATION_STATUSES = ['PASS', 'WARN', 'BLOCK'] as const
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number]

/** A single upstream Validation Engine finding, mirrored into the guardian's own shape. */
export interface ValidationFindingInput {
  severity: 'info' | 'warn' | 'block'
  code: string
  detail: string
}

/** Decoupled result of the Validation Engine, handed to the guardian as context. */
export interface ValidationSummaryInput {
  status: ValidationStatus
  findings: ValidationFindingInput[]
}

/** A minimal, read-only snapshot of the quote the guardian may reason over. */
export interface QuoteSnapshotInput {
  quoteId: string
  /** Free-form trade / job descriptors — plain strings, not app enums. */
  trade?: string
  jobType?: string
  /** Headline commercial figures, if available. All optional and read-only. */
  totals?: {
    subtotalExGst?: number
    gst?: number
    total?: number
    marginPct?: number
  }
  /** Optional scope text for context. */
  scopeNote?: string
}

/**
 * The full request handed to the guardian, AFTER Validation and BEFORE send/export.
 */
export interface GuardianReviewRequest {
  /** Correlates the review with the quote. Opaque id. */
  quoteId: string
  quote: QuoteSnapshotInput
  validation: ValidationSummaryInput
  /**
   * Optional pointer to a persisted learning profile (a Firestore document id in a
   * later milestone). M1 carries the field for contract-completeness ONLY — there
   * is no Firestore client and no persistence in this package.
   */
  learningProfileId?: string
}
