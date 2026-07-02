// HF-SERVICES — BYDA / service-location step not confirmed.
//
// Deterministic hard-floor rule (M2B-1). Pure, stateless, structured-input only:
// it reads pre-classified `ReviewItem.kind` values and the producer-asserted
// `siteConditions.byda*` fields — no free text, no keyword inference, no I/O,
// no environment, and NO external BYDA lookup or verification of any kind.
//
// This single module owns BOTH possible codes — 'HF-SERVICES' and
// 'HF-SERVICES-NOT-REQUIRED-ASSERTED' — as one state machine with one return
// path per state, so the two codes are structurally impossible to co-emit.
// It emits at most ONE flag per review regardless of how many items trigger it.
//
// GATE: without a `reviewItems` entry of kind 'excavation' there is no digging,
// so there is no BYDA / service-location risk to record — the rule is silent
// regardless of BYDA fields or assertions.
//
// State 1 — SATISFIED / SILENT: the quote has allowed for or recorded the step
//   (bydaStatus 'requested' | 'plansReceived' | 'locatedOnSite', or an item of
//   kind 'bydaCheck' | 'serviceLocation' | 'potholing' | 'serviceProtection').
//   This means only that the quote records the step — TerrainPro does NOT
//   verify BYDA enquiries, service plans, or the physical location of
//   underground services.
// State 2 — ASSERTED NOT REQUIRED / AUDIT TRAIL: the operator asserts the step
//   is not needed (bydaRequired === false, or bydaStatus === 'notRequired') →
//   one 'info' flag recording the assertion. No claim TerrainPro verified it;
//   no legal/compliance claim.
// State 3 — UNCONFIRMED / CRITICAL: excavation is present and neither State 1
//   nor State 2 holds → one 'critical' flag. Absent fields, 'unknown', and any
//   unrecognised future value are "no signal": they never satisfy and never
//   assert, so they fall through here.

import type { HardFloorConfig } from '../hard-floor'
import { createRemediationFlag, type RemediationFlag } from '../remediation-flag'
import type { ReviewItemKind } from '../review-items'
import type { QuoteReviewRequest } from '../review-request'
import type { BydaStatus } from '../site-conditions'

/** bydaStatus values that satisfy the check (State 1). */
const SATISFYING_BYDA_STATUSES = ['requested', 'plansReceived', 'locatedOnSite'] as const satisfies readonly BydaStatus[]

/** Review-item kinds that satisfy the check (State 1). */
const SATISFYING_ITEM_KINDS = ['bydaCheck', 'serviceLocation', 'potholing', 'serviceProtection'] as const satisfies readonly ReviewItemKind[]

export function hfServices(request: QuoteReviewRequest, config: HardFloorConfig): RemediationFlag[] {
  const items = request.quote.reviewItems ?? []

  // GATE — no excavation, no digging, nothing to record.
  const hasExcavation = items.some((item) => item.kind === 'excavation')
  if (!hasExcavation) return []

  const site = request.siteConditions

  // STATE 1 — satisfied: the quote allows for or records the step.
  const satisfied =
    (site?.bydaStatus !== undefined && (SATISFYING_BYDA_STATUSES as readonly string[]).includes(site.bydaStatus)) ||
    items.some((item) => (SATISFYING_ITEM_KINDS as readonly string[]).includes(item.kind))
  if (satisfied) return []

  // STATE 2 — operator asserts the step is not required for this quote.
  const assertedNotRequired = site?.bydaRequired === false || site?.bydaStatus === 'notRequired'
  if (assertedNotRequired) {
    return [
      createRemediationFlag(
        {
          code: 'HF-SERVICES-NOT-REQUIRED-ASSERTED',
          category: 'serviceProtection',
          severity: 'info',
          dismissible: false,
          title: 'BYDA / service location marked not required',
          detail:
            'Operator marked BYDA/service-location as not required for this quote. Recorded as the operator’s own call — TerrainPro does not verify it.',
        },
        config,
      ),
    ]
  }

  // STATE 3 — excavation with no recorded step and no assertion.
  return [
    createRemediationFlag(
      {
        code: 'HF-SERVICES',
        category: 'serviceProtection',
        severity: 'critical',
        dismissible: false,
        title: 'BYDA / service location not confirmed',
        detail:
          'Excavation is included, but the quote does not confirm the BYDA (Before You Dig Australia) / service-location step.',
        suggestedAction:
          'Add a BYDA check or service-location allowance to the quote, or record where the step stands — or mark it as not required — in site conditions.',
      },
      config,
    ),
  ]
}
