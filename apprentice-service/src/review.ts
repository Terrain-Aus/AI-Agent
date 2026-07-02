// The review contract.
//
// M1 ships the TYPE only — no implementation, no LLM, no deterministic pass, no
// network, no persistence. A review reads a request, the operator's learning
// profile and the hard-floor config, and returns advisory flags plus an
// append-only learning delta. Nothing else.

import type { DeepReadonly } from './branded'
import type { HardFloorConfig } from './hard-floor'
import type { LearningProfile, LearningProfileDelta } from './learning'
import type { RemediationFlag } from './remediation-flag'
import type { QuoteReviewRequest } from './review-request'

/** The result of a review: advisory flags + an append-only learning delta. */
export interface ReviewResult {
  readonly flags: ReadonlyArray<RemediationFlag>
  readonly profileDelta: LearningProfileDelta
}

/**
 * The review function contract. Async — a later milestone's backend calls a remote
 * model. M1 defines only this signature; it ships no implementation.
 */
export type ReviewFn = (
  request: QuoteReviewRequest,
  profile: DeepReadonly<LearningProfile>,
  config: DeepReadonly<HardFloorConfig>,
) => Promise<ReviewResult>
