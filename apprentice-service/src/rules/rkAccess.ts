// RK-ACCESS — restricted site access.
//
// Deterministic advisory rule (M2B-2). Pure, stateless, structured-input only:
// it reads the single producer-asserted `siteConditions.access` field and
// NOTHING else — no items, no free text, no keyword inference, no I/O, no
// environment.
//
// Trigger:   `siteConditions.access === 'restricted'` — a positive operator
//            assertion that access is constrained.
// No signal: an absent `access` field, and the 'open' / 'moderate' values, are
//            NOT a trigger (absence is "unknown", never "restricted").
//
// ADVISORY, NOT HARD FLOOR: emits under `siteAccess`, which is NOT on the
// default hard floor, so the flag is a dismissible 'warning' (source
// 'universal'). If a deployment adds `siteAccess` to its hard-floor config,
// createRemediationFlag() forces it non-dismissible / 'hardFloor' — the rule
// hardcodes no such assumption. Emits at most ONE flag.

import type { HardFloorConfig } from '../hard-floor'
import { createRemediationFlag, type RemediationFlag } from '../remediation-flag'
import type { QuoteReviewRequest } from '../review-request'

export function rkAccess(request: QuoteReviewRequest, config: HardFloorConfig): RemediationFlag[] {
  if (request.siteConditions?.access !== 'restricted') return []

  return [
    createRemediationFlag(
      {
        code: 'RK-ACCESS',
        category: 'siteAccess',
        severity: 'warning',
        dismissible: true,
        title: 'Restricted site access',
        detail: 'Site access is marked restricted, which can affect plant size, float and durations.',
        suggestedAction:
          'Check the quote reflects restricted access — e.g. smaller plant, extra float/handwork, or longer durations.',
      },
      config,
    ),
  ]
}
