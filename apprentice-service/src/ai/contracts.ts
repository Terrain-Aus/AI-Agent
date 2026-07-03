// AI review boundary contracts — M3A. LOCKED shapes: these types are the
// architect-approved contract surface for the future LLM review layer. Do not
// rename fields, add fields, or redesign them.
//
// ARCHITECTURE LAW (ENGINEERING.md §8, RULES.md "Boundary with future LLM
// review"): the deterministic review engine remains the trusted layer. AI
// review is secondary and ADVISORY ONLY. It never suppresses, duplicates,
// re-orders or edits deterministic flags, never emits deterministic
// RemediationFlag codes, and never touches quote data, pricing, quantities,
// the Business Profile, reviewItems or siteConditions.
//
// AiObservation is deliberately NOT a RemediationFlag and must never reuse or
// extend it. Observations carry no code, no id, no severity, no category, no
// dismissible and no source: they are dismissible by construction because they
// are advisory only, and there is no severity because AI cannot emit critical.
// The only link back to the deterministic layer is `relatedFlagCodes` — a
// read-only REFERENCE to codes the deterministic engine actually emitted in
// the current review. The AI may point at deterministic flags; it may not own
// them or invent them.
//
// M3A ships the boundary only: no real provider, no network, no LLM calls.

import type { RemediationFlag } from '../remediation-flag'
import type { ReviewItem } from '../review-items'
import type { SiteConditions } from '../site-conditions'

export type AiObservationKind =
  | 'observation'
  | 'question'
  | 'suggestion';

export interface AiObservation {
  kind: AiObservationKind;
  message: string;
  relatedFlagCodes?: string[];
}

export type AiReviewStatus =
  | 'completed'
  | 'unavailable'
  | 'invalidOutput';

export interface AiReviewProvenance {
  provider: string;
  model: string;
  generatedAt: string;
}

export interface AiReviewResult {
  status: AiReviewStatus;
  observations: AiObservation[];
  provenance?: AiReviewProvenance;
  error?: {
    kind: 'providerError' | 'invalidOutput';
    message: string;
  };
}

export interface AiReviewContext {
  reviewItems?: readonly ReviewItem[];
  siteConditions?: SiteConditions;
  deterministicFlags: readonly RemediationFlag[];
}

export interface AiReviewProvider {
  review(context: AiReviewContext): Promise<unknown>;
}
