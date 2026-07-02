// RK-WATER — wet ground / high water table indicated.
//
// Deterministic advisory rule (M2B-2). Pure, stateless, structured-input only:
// it reads the single producer-asserted `siteConditions.wetConditions` boolean
// and NOTHING else — no items, no free text, no keyword inference, no I/O, no
// environment.
//
// Trigger:   `siteConditions.wetConditions === true`.
// No signal: an absent field (and any non-`true` value) is NOT a trigger —
//            absence is "unknown", never "wet".
//
// ADVISORY, NOT HARD FLOOR: emits under `dewatering`, which is NOT on the
// default hard floor, so the flag is a dismissible 'warning' (source
// 'universal'). A deployment that adds `dewatering` to its hard-floor config
// makes createRemediationFlag() force it non-dismissible / 'hardFloor'; the
// rule hardcodes no such assumption. Emits at most ONE flag.

import type { HardFloorConfig } from '../hard-floor'
import { createRemediationFlag, type RemediationFlag } from '../remediation-flag'
import type { QuoteReviewRequest } from '../review-request'

export function rkWater(request: QuoteReviewRequest, config: HardFloorConfig): RemediationFlag[] {
  if (request.siteConditions?.wetConditions !== true) return []

  return [
    createRemediationFlag(
      {
        code: 'RK-WATER',
        category: 'dewatering',
        severity: 'warning',
        dismissible: true,
        title: 'Wet ground / high water table',
        detail: 'Wet conditions are marked, which can require dewatering, pumping or a wet-weather allowance.',
        suggestedAction: 'Check the quote allows for dewatering / pumping or a wet-conditions allowance as needed.',
      },
      config,
    ),
  ]
}
