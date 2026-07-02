// Hard-floor configuration.
//
// The hard floor is the set of categories that are NON-NEGOTIABLE: any flag in a
// hard-floor category is forced non-dismissible and sourced as 'hardFloor'. The
// config is data-driven so it can be tuned per deployment — but it must NEVER be
// empty, and every entry must be an approved category.

import { isApprovedCategory, type RemediationCategory } from './categories'

/** Non-empty by construction: the tuple type requires at least one category. */
export interface HardFloorConfig {
  readonly categories: readonly [RemediationCategory, ...RemediationCategory[]]
}

/** The default hard floor: spoil disposal and service protection. */
export const DEFAULT_HARD_FLOOR_CONFIG: HardFloorConfig = {
  categories: ['spoilDisposal', 'serviceProtection'],
}

/**
 * Build a HardFloorConfig. Enforces the two invariants at runtime:
 *  - must never be empty
 *  - every category must be in the approved registry
 */
export function createHardFloorConfig(categories: readonly RemediationCategory[]): HardFloorConfig {
  if (categories.length === 0) {
    throw new Error('HardFloorConfig must never be empty')
  }
  for (const category of categories) {
    if (!isApprovedCategory(category)) {
      throw new Error(`Unknown hard-floor category: ${String(category)}`)
    }
  }
  return { categories: [categories[0], ...categories.slice(1)] }
}

/** Is `category` part of the hard floor for this config? */
export function isHardFloorCategory(config: HardFloorConfig, category: RemediationCategory): boolean {
  return config.categories.includes(category)
}
