// The review contract — and, as of M2B-1, its deterministic implementation.
//
// M1 shipped the TYPE only. M2B-1 adds `deterministicReview`: a ReviewFn that
// runs the deterministic hard-floor rule registry (src/rules/) and nothing
// else — no LLM, no network, no persistence, no learning delta. A review reads
// a request, the operator's learning profile and the hard-floor config, and
// returns advisory flags plus an append-only learning delta. Nothing else.

import type { DeepReadonly } from './branded'
import { createHardFloorConfig, type HardFloorConfig } from './hard-floor'
import type { LearningProfile, LearningProfileDelta } from './learning'
import type { RemediationFlag } from './remediation-flag'
import type { QuoteReviewRequest } from './review-request'
import { runDeterministicRules } from './rules'

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

/**
 * The deterministic review entry point (M2B-1). Runs the deterministic
 * hard-floor rule registry in registry order — flags come back in that order,
 * stably. Pure apart from being async to satisfy the ReviewFn contract: no
 * I/O, no network, no environment reads, no learning (the profile is unread
 * and the delta is always empty).
 *
 * DeepReadonly widens the config's non-empty categories tuple to a plain
 * ReadonlyArray, so the config is rebuilt through createHardFloorConfig() —
 * which also re-asserts the never-empty / approved-categories invariants.
 */
export const deterministicReview: ReviewFn = async (request, _profile, config) => {
  const hardFloor = createHardFloorConfig(config.categories)
  return {
    flags: runDeterministicRules(request, hardFloor),
    profileDelta: { appendEvents: [] },
  }
}
