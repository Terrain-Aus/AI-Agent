// FINAL QUOTE ENGINE — assemble the client quote + internal cost sheet. If
// Validation set blockSend, do NOT output a sendable client quote (LAW 6):
// issue an "indicative, site visit required" instead.

import type { ClientQuote, InternalSheet, Quote } from './types'
import { audit } from './types'

export function runFinalQuote(q: Quote): Quote {
  const c = q.commercial
  const v = q.validation
  const blocked = v?.blockSend ?? false
  const sendable = !blocked && (c?.valid ?? false)

  const inclusions = (q.rated?.lines ?? []).map((l) => l.item)
  const exclusions = ['Rock removal beyond assumed ground', 'Service relocation', 'Importing unsuitable-material replacement']

  const clientQuote: ClientQuote = {
    scope: `${q.jobType?.replace(/_/g, ' ')} — ${q.trade}`,
    inclusions: dedupe(inclusions),
    exclusions,
    assumptions: q.assumptions,
    quoteType: q.quoteType ?? 'Estimate',
    confidence: q.confidence ?? 0,
    price: sendable ? (c?.totalIncGst ?? null) : null,
    priceText: sendable
      ? `$${(c?.totalIncGst ?? 0).toLocaleString('en-AU')} inc GST`
      : 'Indicative only — a site visit is required before a firm price can be issued.',
    sendable,
  }

  const internalSheet: InternalSheet = {
    lines: q.rated?.lines ?? [],
    costTotal: c?.costTotal ?? 0,
    sellTotal: c?.sellTotal ?? 0,
    contingencyAmount: c?.contingencyAmount ?? 0,
    marginPct: c?.marginPct ?? 0,
    realisedMargin: c?.realisedMargin ?? 0,
    gst: c?.gst ?? 0,
    totalIncGst: c?.totalIncGst ?? 0,
    flags: [...q.riskFlags, ...(v?.findings.filter((f) => f.severity !== 'info').map((f) => `${f.severity.toUpperCase()}: ${f.detail}`) ?? [])],
  }

  q.clientQuote = clientQuote
  q.internalSheet = internalSheet
  audit(q, { engine: 'FinalQuote', rule: 'assemble', result: blocked ? 'BLOCKED — indicative only, no sendable client quote' : `sendable $${c?.totalIncGst}` })
  return q
}

const dedupe = (a: string[]) => [...new Set(a)]
