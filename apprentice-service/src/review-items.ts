// Review items — NEW optional contract surface added in M2A.
//
// The Step 0 audit found M1 carried NO line items and NO item-kind discriminator:
// the guardian could not structurally answer "does an excavation exist?" or "does
// a spoil-disposal / service-protection / compaction-testing allowance exist?"
// without keyword inference on free text. This block closes that gap.
//
// Classification happens UPSTREAM: the producer classifies each quote line into
// exactly one `kind` BEFORE the guardian sees it. The guardian trusts `kind` and
// NEVER parses `label`, `scopeNote` or any other free text.

import type { ReviewedAmount } from './branded'

/**
 * The classified role of a quote item. CLOSED set (mirrors the M1 category
 * registry): adding a kind is a deliberate edit to this file — nothing else may
 * introduce one.
 *
 * `serviceProtection` here is a NEW input item kind. It shares a name with the
 * existing `serviceProtection` RemediationCategory (an OUTPUT flag value) but is
 * a distinct input concept — M1 had no input item kinds at all.
 *
 * BYDA note: presence of a `bydaCheck` or `serviceLocation` item means only that
 * the quote includes or records that allowance/step. TerrainPro does NOT verify
 * BYDA (Before You Dig Australia) enquiries, service plans, or the physical
 * location of underground services.
 */
export const REVIEW_ITEM_KINDS = [
  'excavation', // dig / trench / cut / fill / bulk earthworks — ground-penetrating ACTIVITY
  'spoilDisposal', // cart-away / tip / spoil-removal ALLOWANCE
  'bydaCheck', // BYDA (Before You Dig Australia) enquiry line / ALLOWANCE
  'serviceLocation', // service-location / locate ALLOWANCE
  'potholing', // pot-holing / hydro-excavation to expose services ALLOWANCE
  'serviceProtection', // protect-in-place ALLOWANCE
  'compactionTesting', // compaction / geotech test ALLOWANCE
  'other', // maps to none of the above
] as const

export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number]

/** Runtime guard: is `x` a kind in the closed registry? */
export function isReviewItemKind(x: unknown): x is ReviewItemKind {
  return typeof x === 'string' && (REVIEW_ITEM_KINDS as readonly string[]).includes(x)
}

/**
 * A single pre-classified, read-only quote item. Presence in the array is the
 * structural signal ("an excavation activity exists"); absence of the whole
 * `reviewItems` array means "no structured item data supplied" — which is NOT
 * the same as an empty array ("structured data supplied, no items").
 */
export interface ReviewItem {
  /** Structural discriminator — the item's classified role. */
  kind: ReviewItemKind
  /** Optional stable producer id. Opaque to the guardian. */
  id?: string
  /** Optional display label. NEVER parsed by the guardian. */
  label?: string
  /** Optional reviewed amount. Read via amountValue(). NOT used for margin — CM-MARGIN is deferred. */
  amount?: ReviewedAmount
}

/** Narrowing guard: is `x` a well-formed ReviewItem? */
export function isReviewItem(x: unknown): x is ReviewItem {
  if (typeof x !== 'object' || x === null) return false
  const item = x as Record<string, unknown>
  if (!isReviewItemKind(item.kind)) return false
  if (item.id !== undefined && typeof item.id !== 'string') return false
  if (item.label !== undefined && typeof item.label !== 'string') return false
  if (item.amount !== undefined && typeof item.amount !== 'number') return false
  return true
}
