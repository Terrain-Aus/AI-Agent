// RK-TRAFFIC — works adjacent to a road reserve, footpath or verge.
//
// Deterministic advisory rule (M2B-2). Pure, stateless, structured-input only:
// it reads the single producer-asserted `siteConditions.roadReserveAdjacent`
// boolean and NOTHING else — no items, no free text, no keyword inference, no
// I/O, no environment.
//
// Trigger:   `siteConditions.roadReserveAdjacent === true`.
// No signal: an absent field (and any non-`true` value) is NOT a trigger —
//            absence is "unknown", never "adjacent".
//
// ADVISORY, NOT HARD FLOOR: emits under `trafficManagement`, which is NOT on
// the default hard floor, so the flag is a dismissible 'warning' (source
// 'universal'). A deployment that adds `trafficManagement` to its hard-floor
// config makes createRemediationFlag() force it non-dismissible / 'hardFloor';
// the rule hardcodes no such assumption. Emits at most ONE flag.

import type { HardFloorConfig } from '../hard-floor'
import { createRemediationFlag, type RemediationFlag } from '../remediation-flag'
import type { QuoteReviewRequest } from '../review-request'

export function rkTraffic(request: QuoteReviewRequest, config: HardFloorConfig): RemediationFlag[] {
  if (request.siteConditions?.roadReserveAdjacent !== true) return []

  return [
    createRemediationFlag(
      {
        code: 'RK-TRAFFIC',
        category: 'trafficManagement',
        severity: 'warning',
        dismissible: true,
        title: 'Works adjacent to a road reserve',
        detail: 'Works are marked adjacent to a road reserve, footpath or verge, which can require traffic management.',
        suggestedAction:
          'Check the quote allows for traffic management and any road-reserve / footpath permits or approvals.',
      },
      config,
    ),
  ]
}
