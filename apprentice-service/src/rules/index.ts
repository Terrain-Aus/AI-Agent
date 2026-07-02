// Deterministic rule registry — M2B-1 (hard floor) + M2B-2 (advisory site risk).
//
// OWNERSHIP: the checks registered here are owned DETERMINISTICALLY by this
// registry. A future LLM review pass must NOT duplicate these checks and must
// NOT suppress their output — they run on structured input only and their
// verdict is final.
//
// Two tiers, in this order:
//   HARD FLOOR (M2B-1) — critical, non-dismissible, gated on an excavation item:
//     1. HF-SPOIL
//     2. HF-SERVICES
//   ADVISORY SITE RISK (M2B-2) — dismissible 'warning', each fired by a single
//   positive `siteConditions` assertion (absent / 'unknown' = no signal):
//     3. RK-ACCESS   (siteConditions.access === 'restricted')
//     4. RK-TRAFFIC  (siteConditions.roadReserveAdjacent === true)
//     5. RK-WATER    (siteConditions.wetConditions === true)
//
// RK-COMPACT and CM-MARGIN remain deliberately absent, pending later contract
// support (no compaction-required trigger field; no margin threshold config).
//
// Registry order IS output order and must stay stable: hard-floor flags always
// precede advisory flags, in the numbered order above.

import type { HardFloorConfig } from '../hard-floor'
import type { RemediationFlag } from '../remediation-flag'
import type { QuoteReviewRequest } from '../review-request'
import { hfServices } from './hfServices'
import { hfSpoil } from './hfSpoil'
import { rkAccess } from './rkAccess'
import { rkTraffic } from './rkTraffic'
import { rkWater } from './rkWater'

export { hfSpoil } from './hfSpoil'
export { hfServices } from './hfServices'
export { rkAccess } from './rkAccess'
export { rkTraffic } from './rkTraffic'
export { rkWater } from './rkWater'

/** A deterministic rule: pure, stateless, structured-input only, 0 or 1 flags. */
export type DeterministicRule = (request: QuoteReviewRequest, config: HardFloorConfig) => RemediationFlag[]

/**
 * The registry. Order is deliberate and stable: hard-floor rules (HF-SPOIL,
 * HF-SERVICES) first, then advisory site-risk rules (RK-ACCESS, RK-TRAFFIC,
 * RK-WATER).
 */
export const DETERMINISTIC_RULES: readonly DeterministicRule[] = [
  hfSpoil,
  hfServices,
  rkAccess,
  rkTraffic,
  rkWater,
]

/**
 * Run every registered rule in registry order and concatenate the flags.
 * Pure and deterministic: same input → same flags in the same order.
 */
export function runDeterministicRules(request: QuoteReviewRequest, config: HardFloorConfig): RemediationFlag[] {
  return DETERMINISTIC_RULES.flatMap((rule) => rule(request, config))
}
