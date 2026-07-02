// Deterministic hard-floor rule registry — M2B-1.
//
// OWNERSHIP: the checks registered here (HF-SPOIL, HF-SERVICES) are owned
// DETERMINISTICALLY by this registry. A future LLM review pass must NOT
// duplicate these checks and must NOT suppress their output — they run on
// structured input only and their verdict is final.
//
// RK-ACCESS, RK-TRAFFIC, RK-WATER, RK-COMPACT and CM-MARGIN are deliberately
// absent, pending later contract support.
//
// Registry order IS output order and must stay stable:
//   1. HF-SPOIL
//   2. HF-SERVICES

import type { HardFloorConfig } from '../hard-floor'
import type { RemediationFlag } from '../remediation-flag'
import type { QuoteReviewRequest } from '../review-request'
import { hfServices } from './hfServices'
import { hfSpoil } from './hfSpoil'

export { hfSpoil } from './hfSpoil'
export { hfServices } from './hfServices'

/** A deterministic rule: pure, stateless, structured-input only, 0 or 1 flags. */
export type DeterministicRule = (request: QuoteReviewRequest, config: HardFloorConfig) => RemediationFlag[]

/** The registry. Order is deliberate and stable: HF-SPOIL, then HF-SERVICES. */
export const DETERMINISTIC_RULES: readonly DeterministicRule[] = [hfSpoil, hfServices]

/**
 * Run every registered rule in registry order and concatenate the flags.
 * Pure and deterministic: same input → same flags in the same order.
 */
export function runDeterministicRules(request: QuoteReviewRequest, config: HardFloorConfig): RemediationFlag[] {
  return DETERMINISTIC_RULES.flatMap((rule) => rule(request, config))
}
