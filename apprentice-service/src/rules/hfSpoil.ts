// HF-SPOIL — spoil disposal / cart-away not confirmed.
//
// Deterministic hard-floor rule (M2B-1). Pure, stateless, structured-input only:
// it reads pre-classified `ReviewItem.kind` values and NOTHING else — no labels,
// no scope notes, no free text, no keyword inference, no I/O, no environment.
//
// Trigger:    a `reviewItems` entry of kind 'excavation' exists.
// Suppressor: a `reviewItems` entry of kind 'spoilDisposal' exists.
// Emits at most ONE flag regardless of how many items trigger it. An absent
// `reviewItems` array and an empty array are both "no trigger".

import type { HardFloorConfig } from '../hard-floor'
import { createRemediationFlag, type RemediationFlag } from '../remediation-flag'
import type { QuoteReviewRequest } from '../review-request'

export function hfSpoil(request: QuoteReviewRequest, config: HardFloorConfig): RemediationFlag[] {
  const items = request.quote.reviewItems ?? []

  const hasExcavation = items.some((item) => item.kind === 'excavation')
  if (!hasExcavation) return []

  const hasSpoilDisposal = items.some((item) => item.kind === 'spoilDisposal')
  if (hasSpoilDisposal) return []

  return [
    createRemediationFlag(
      {
        code: 'HF-SPOIL',
        category: 'spoilDisposal',
        severity: 'critical',
        dismissible: false,
        title: 'Spoil disposal not confirmed',
        detail: 'Excavation is included, but spoil disposal / cart-away is not confirmed in the quote.',
        suggestedAction:
          'Add a spoil disposal / cart-away allowance, or confirm the quote already covers getting spoil off site.',
      },
      config,
    ),
  ]
}
