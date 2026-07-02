// RemediationFlag — the ONLY output of the TerrainPro Apprentice guardian service.
//
// The Apprentice guardian is an ADVISORY service. It inspects a validated quote
// after the Validation Engine and before send/export, and returns zero or more
// RemediationFlags. It NEVER mutates the quote, quantities, pricing, RateBook, BI,
// Business Profile, Quote Workspace or pipeline internals — a flag is a read-only
// observation plus an optional suggested remediation. Acting on a flag is always
// the contractor's / caller's decision.
//
// M1 is TYPES & CONTRACTS ONLY. There is no HTTP route, no Cloud Run, no Firestore
// and no Vertex AI / Gemini here — those arrive in later milestones.

/** How serious a flag is. Advisory scale — nothing here blocks or mutates. */
export const REMEDIATION_SEVERITIES = ['info', 'advisory', 'critical'] as const
export type RemediationSeverity = (typeof REMEDIATION_SEVERITIES)[number]

/** The kind of concern a flag raises. */
export const REMEDIATION_CATEGORIES = [
  'completeness',
  'accuracy',
  'compliance',
  'commercial',
  'consistency',
] as const
export type RemediationCategory = (typeof REMEDIATION_CATEGORIES)[number]

/**
 * A read-only pointer to WHAT a flag concerns (e.g. a line item or a total).
 * The guardian never edits the target — this is a reference for the UI/caller only.
 */
export interface RemediationTargetRef {
  /** Generic kind, e.g. 'quote' | 'line-item' | 'total' | 'validation-finding'. */
  kind: string
  /** Identifier within that kind. Opaque to the guardian. */
  id: string
}

/**
 * A single advisory observation from the guardian. Read-only by contract.
 */
export interface RemediationFlag {
  /** Stable machine code for the check, e.g. 'missing-scope-note'. */
  code: string
  severity: RemediationSeverity
  category: RemediationCategory
  /** Short human-readable headline. */
  title: string
  /** Plain-language explanation of what was observed and why it matters. */
  detail: string
  /** Optional: what the contractor could do about it. Advice only — never applied. */
  suggestedAction?: string
  /** Optional: why the guardian raised this (audit / future learning). */
  rationale?: string
  /** Optional: read-only pointer to the thing this flag is about. */
  target?: RemediationTargetRef
  /** Optional model confidence in [0, 1] (populated once the M2 AI backend exists). */
  confidence?: number
  /** Provenance — always the guardian service. */
  source: 'apprentice'
}
