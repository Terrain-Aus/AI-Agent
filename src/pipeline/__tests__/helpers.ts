import type { QuoteContext } from '../types'

/** A representative physical site walkthrough for tests. */
export function sampleContext(): QuoteContext {
  return {
    site: {
      areas: [{ id: 'a1', label: 'Driveway', areaM2: 80 }],
      depths: [{ id: 'a1', label: 'Driveway', depthMm: 200 }],
      volumesInput: [],
      soilType: 'clay',
      accessConstraints: ['tight'],
    },
    scopeItems: [
      { id: 'conc', description: 'Concrete 25MPa', category: 'concrete', quantity: 16, unit: 'm3', materialId: 'conc25' },
      { id: 'mesh', description: 'Reo mesh SL72', category: 'reo', quantity: 80, unit: 'm2', materialId: 'mesh' },
    ],
  }
}

/** Recursively collect object keys whose name implies money. */
const MONEY_TERMS = ['cost', 'rate', 'price', 'sell', 'margin', 'dollar', 'amount', 'overhead', 'contingen', 'charge', 'quoted', 'total$']
export function findMoneyKeys(obj: unknown, path = ''): string[] {
  const hits: string[] = []
  if (obj === null || typeof obj !== 'object') return hits
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase()
    if (MONEY_TERMS.some((t) => lower.includes(t))) hits.push(`${path}${key}`)
    hits.push(...findMoneyKeys(value, `${path}${key}.`))
  }
  return hits
}
