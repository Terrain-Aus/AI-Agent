// COMMERCIAL ENGINE — markup (materials/subbies) + contingency + margin
// guardrail + GST. It NEVER looks up a rate (LAW 4). Labour and plant already
// carry their own sell price; only materials and subbies are marked up here
// (LAW 5 — never blanket-margin labour/plant, never zero-margin materials).

import type { Commercial, PricingPolicy, Quote } from './types'
import { audit } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

export function runCommercial(q: Quote, policy: PricingPolicy): Quote {
  const lines = q.rated?.lines ?? []

  // Labour + plant: sell already set by Rate (their own preferredSell).
  const labourCharge = sum(lines.filter((l) => l.kind === 'labour' || l.kind === 'fee').map((l) => l.charge))
  const plantCharge = sum(lines.filter((l) => l.kind === 'plant').map((l) => l.charge))

  // Materials + subbies: stored at COST, marked up by policy here.
  const materialCost = sum(lines.filter((l) => l.kind === 'material').map((l) => l.cost))
  const subbieCost = sum(lines.filter((l) => l.kind === 'subbie').map((l) => l.cost))
  const materialSell = round2(materialCost * (1 + policy.materialMarkup))
  const subbieSell = round2(subbieCost * (1 + policy.subcontractMarkup))

  const baseSell = round2(labourCharge + plantCharge + materialSell + subbieSell)
  const contingencyPct = q.contingencyPct ?? 0
  const contingencyAmount = round2(baseSell * contingencyPct)

  const costTotal = round2(sum(lines.map((l) => l.cost)))
  let sellTotal = round2(baseSell + contingencyAmount)

  // Margin model: MARGIN (profit/price) for the guardrail.
  let realisedMargin = sellTotal > 0 ? round4((sellTotal - costTotal) / sellTotal) : 0
  const targetMargin = 0.3
  let valid = true

  // Guardrail: top up toward target if thin; block if negative & not allowed.
  if (realisedMargin < 0 && !policy.allowNegativeMargin) {
    valid = false
  } else if (realisedMargin < targetMargin) {
    // optional top-up to reach the minimum job value or flag (kept as flag here)
  }

  // Minimum job value floor.
  if (sellTotal < policy.minimumJobValue) {
    sellTotal = policy.minimumJobValue
    realisedMargin = sellTotal > 0 ? round4((sellTotal - costTotal) / sellTotal) : 0
  }

  const gst = round2(sellTotal * 0.1)
  const totalIncGst = round2(sellTotal + gst)

  const commercial: Commercial = {
    labourCharge: round2(labourCharge),
    plantCharge: round2(plantCharge),
    materialCost: round2(materialCost),
    materialSell,
    subbieCost: round2(subbieCost),
    subbieSell,
    baseSell,
    contingencyAmount,
    costTotal,
    sellTotal,
    marginPct: targetMargin,
    realisedMargin,
    gst,
    totalIncGst,
    valid,
  }
  q.commercial = commercial
  audit(q, { engine: 'Commercial', rule: 'markup+contingency+margin+gst', result: `sell=$${sellTotal} cost=$${costTotal} margin=${Math.round(realisedMargin * 100)}% gst=$${gst} total=$${totalIncGst} valid=${valid}` })
  return q
}

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0)
const round4 = (n: number) => Math.round(n * 10000) / 10000
