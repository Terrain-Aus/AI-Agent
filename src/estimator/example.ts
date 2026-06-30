// Runnable end-to-end example — a Mount Isa earthworks pad_prep:
// cut ~120 m³ bank, cart spoil, import roadbase, machine float, NO site visit,
// ground "unknown". Produces a client quote + internal sheet + validation report.
//
// Run with:  npx tsx src/estimator/example.ts   (or import runExample() in a test)

import type { RawInput } from './types'
import { InMemoryBIRepository } from './repository'
import { BRISBANE_BI, MT_ISA_BI } from './seed'
import { estimateFor } from './pipeline'

export function padPrepRawInput(): RawInput {
  return {
    userText: 'Build a pad to FFL, about 120 m3 cut, cart the spoil off and import roadbase.',
    answers: {
      jobType: 'pad_prep',
      areaM2: 200,
      cutDepthMm: 600, // 200 × 0.6 = 120 m³ bank
      material: 'clay',
      access: 'open',
      cartageRequired: true,
      importRoadbase: true,
      roadbaseDepthMm: 150,
      requestedQuoteType: 'Fixed',
      siteVisit: false,
      groundConfirmed: false,
      // access was eyeballed, not measured → drives low confidence
      __sources: { access: { source: 'eyeballed', confidence: 0.4 }, cutDepthMm: { source: 'stated', confidence: 0.6 }, material: { source: 'eyeballed', confidence: 0.4 } },
    },
  }
}

/** A high-confidence concreting raw input (site visited, ground confirmed). */
export function concretingRawInput(over: Record<string, unknown> = {}): RawInput {
  return {
    userText: over.userText as string ?? 'Concreting job',
    answers: {
      jobType: 'slab',
      areaM2: 120,
      thicknessMm: 100,
      finish: 'broom',
      reinforcement: 'SL72',
      access: 'chute',
      subBase: 'roadbase',
      requestedQuoteType: 'Fixed',
      siteVisit: true,
      groundConfirmed: true,
      __sources: {
        areaM2: { source: 'measured', confidence: 0.9 },
        thicknessMm: { source: 'measured', confidence: 0.9 },
        access: { source: 'measured', confidence: 0.9 },
        finish: { source: 'stated', confidence: 0.85 },
        reinforcement: { source: 'stated', confidence: 0.85 },
      },
      ...over,
    },
  }
}

export function runExample(contractorId = 'mtisa-earthworks') {
  const repo = new InMemoryBIRepository({ [BRISBANE_BI.contractorId]: BRISBANE_BI, [MT_ISA_BI.contractorId]: MT_ISA_BI })
  return estimateFor(padPrepRawInput(), contractorId, repo)
}

/** Pretty-print the three deliverables for a quote (used by the demo script). */
export function printExample(contractorId = 'mtisa-earthworks'): void {
  const q = runExample(contractorId)
  /* eslint-disable no-console */
  console.log('\n=== CLIENT QUOTE ===')
  console.log(JSON.stringify(q.clientQuote, null, 2))
  console.log('\n=== INTERNAL SHEET ===')
  console.log(JSON.stringify(q.internalSheet, null, 2))
  console.log('\n=== VALIDATION ===')
  console.log(JSON.stringify(q.validation, null, 2))
  console.log('\n=== ENGINE AUDIT ===')
  for (const a of q.engineAudit) console.log(`${a.engine.padEnd(12)} ${a.rule.padEnd(30)} ${a.result ?? a.added ?? ''}`)
}
