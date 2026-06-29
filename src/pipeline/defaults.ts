// Factory defaults for the contractor pipeline workflow.

import type { QuoteContext, RiskInputs } from './types'

export function emptyQuoteContext(): QuoteContext {
  return {
    site: {
      areas: [],
      depths: [],
      volumesInput: [],
      soilType: 'unknown',
      accessConstraints: [],
    },
    scopeItems: [],
  }
}

export function defaultRiskInputs(): RiskInputs {
  return { flags: [] }
}
