// Hidden Cost Intelligence — the bit that stops contractors underquoting.
// Each rule inspects the job spec (and the raw description) and, if it fires,
// raises a flag with a dollar impact and an apprentice-voice explanation.

import type { HiddenCost, JobSpec } from './types'
import { resolveLocation, SPOIL_TONNES_PER_M3 } from './pricing'

interface Ctx {
  spec: JobSpec
  area: number
  volumeM3: number
  raw: string
}

type Rule = (ctx: Ctx) => HiddenCost | null

const rules: Rule[] = [
  // --- Remote location freight + travel + accommodation ---
  ({ spec, volumeM3 }) => {
    const loc = resolveLocation(spec.location)
    if (!loc.remote) return null
    const freight = Math.round(volumeM3 * loc.supplyLoadM3)
    const travel = Math.round(loc.travelHrs * 2 * 75 * 2) // crew of 2, return trip, per day-ish
    const accom = loc.travelHrs >= 2.5 ? 320 : 0
    const impact = freight + travel + accom
    return {
      id: 'remote-location',
      title: `Remote location loading — ${loc.name}`,
      why: `${loc.name} isn't a metro pour. ${loc.note} You're up for concrete freight (~$${freight}), crew travel time (~$${travel})${accom ? ` and a night's accommodation (~$${accom})` : ''}. Quote it metro and you'll wear the difference yourself.`,
      severity: 'critical',
      estImpact: impact,
      included: true,
    }
  },

  // --- Reactive / black soil ---
  ({ spec, area }) => {
    if (spec.soil !== 'reactive-clay' && !/black soil|reactive|expansive/i.test(spec.rawDescription)) return null
    const impact = Math.round(area * 14 + 380)
    return {
      id: 'reactive-soil',
      title: 'Reactive / black soil movement',
      why: 'Reactive clay heaves and shrinks with moisture. You need a deeper, stiffer footing system and likely extra reo to stop the slab cracking — engineers will spec it (AS2870). Build it like normal ground and you risk a callback and a crack-repair argument.',
      severity: 'high',
      estImpact: impact,
      included: false,
    }
  },

  // --- Rock in the dig ---
  ({ spec, area }) => {
    if (spec.soil !== 'rock' && !/\brock\b|sandstone|granite|shale/i.test(spec.rawDescription)) return null
    const impact = Math.round(area * 18 + 450)
    return {
      id: 'rock',
      title: 'Rock — hard digging',
      why: "Rock kills excavation budgets. You'll need a rock breaker or bigger machine, hire goes up and the dig takes 2–3× longer. Always price rock as a provisional sum or put an exclusion on the quote.",
      severity: 'high',
      estImpact: impact,
      included: false,
    }
  },

  // --- Difficult access / pump ---
  ({ spec, volumeM3 }) => {
    if (spec.access !== 'difficult' && !spec.pumpRequired) return null
    const impact = spec.pumpRequired ? 1250 : Math.round(volumeM3 * 35 + 300)
    return {
      id: 'access',
      title: 'Poor site access',
      why: spec.pumpRequired
        ? "No truck access means a concrete pump — that's a line truck or a day rate plus a pump hand. Easy $1,200+ that disappears if you assume the agi can back up to the pour."
        : "Tight access means barrowing concrete by hand. That's slow, brutal labour that blows your m² rate out. Add bodies or a pump and price it.",
      severity: 'high',
      estImpact: impact,
      included: spec.pumpRequired,
    }
  },

  // --- Exposed aggregate wash-off + sealer ---
  ({ spec, area }) => {
    if (spec.finish !== 'exposed-aggregate') return null
    const impact = Math.round(area * 6 + 180)
    return {
      id: 'exposed-agg-seal',
      title: 'Exposed agg — wash-off & sealing',
      why: 'Exposed aggregate needs a timed wash-off (you have to be on site as it goes off) plus surface retarder and at least one coat of sealer — most people want two, and a re-seal in 12 months. The sealer and the extra time on site are routinely left out.',
      severity: 'medium',
      estImpact: impact,
      included: false,
    }
  },

  // --- Boxing strip & disposal ---
  ({ spec }) => {
    if (!spec.boxingRequired) return null
    return {
      id: 'boxing-strip',
      title: 'Formwork strip & cart-off',
      why: "Boxing isn't just setting up — it's stripping it, de-nailing, and carting the broken timber away. Half a day you didn't price, plus tip fees for the rubbish.",
      severity: 'low',
      estImpact: 220,
      included: true,
    }
  },

  // --- Spoil disposal / tip fees ---
  ({ spec, area, volumeM3 }) => {
    if (!spec.prepRequired && spec.excavationDepthMm === 0) return null
    const digDepth = spec.excavationDepthMm || 150
    const spoilM3 = (area * digDepth) / 1000
    const tonnes = spoilM3 * SPOIL_TONNES_PER_M3
    const impact = Math.round(tonnes * 38 + 180)
    void volumeM3
    return {
      id: 'disposal',
      title: 'Spoil disposal & tip fees',
      why: `You're digging out ~${spoilM3.toFixed(1)}m³ (~${tonnes.toFixed(1)} tonne). That spoil has to go somewhere — truck hire and tipping fees add up fast, and the tip won't take contaminated or mixed fill at the clean-fill rate.`,
      severity: 'medium',
      estImpact: impact,
      included: true,
    }
  },

  // --- Driveway: council vehicle crossing / permit ---
  ({ spec }) => {
    if (spec.jobType !== 'driveway') return null
    return {
      id: 'vehicle-crossing',
      title: 'Council vehicle crossing / permit',
      why: "Tying a driveway into the road usually means a council-approved vehicle crossing (the layback/invert) and an inspection. Permits, bonds and the crossing itself are the client's cost — but if you don't flag it, they'll expect you to wear it.",
      severity: 'medium',
      estImpact: 650,
      included: false,
    }
  },

  // --- Dial Before You Dig / services ---
  ({ spec }) => {
    if (!spec.prepRequired && spec.excavationDepthMm === 0) return null
    return {
      id: 'services',
      title: 'Underground services',
      why: 'Before any dig: Dial Before You Dig and pothole anything that shows up. Clip a water main, gas or NBN and the repair bill — and the downtime — is on you. Cheap insurance, routinely skipped.',
      severity: 'medium',
      estImpact: 150,
      included: false,
    }
  },

  // --- Minimum concrete load short-load fee ---
  ({ volumeM3 }) => {
    if (volumeM3 >= 6) return null
    const impact = volumeM3 < 3 ? 220 : 130
    return {
      id: 'short-load',
      title: 'Short-load / part-load fee',
      why: `Only ${volumeM3.toFixed(1)}m³? Most batch plants charge a short-load fee under ~6m³ and sting you again if the truck waits on site. Small pours are where margins quietly vanish.`,
      severity: 'low',
      estImpact: impact,
      included: true,
    }
  },

  // --- Wet weather contingency (FNQ / Top End / wet season) ---
  ({ spec, area }) => {
    const loc = resolveLocation(spec.location)
    const wet = /\b(qld|nt|cairns|darwin|townsville)\b/i.test(loc.state + ' ' + loc.name)
    if (!wet) return null
    return {
      id: 'wet-weather',
      title: 'Wet-weather contingency',
      why: "Up north a pour can be washed out at short notice — you still wear standby labour and a re-mobilise. Build a small weather contingency in, especially in the wet season.",
      severity: 'low',
      estImpact: Math.round(area * 2 + 120),
      included: false,
    }
  },

  // --- Slope / fall ---
  ({ spec, area }) => {
    if (!/slope|fall|steep|grade|sloping/i.test(spec.rawDescription)) return null
    return {
      id: 'slope',
      title: 'Sloping site — cut & fill / step-downs',
      why: "A fall on the site means cut-and-fill to get your levels, possibly a step-down or a small retaining edge, and more formwork. Levels are where 'simple' jobs turn into two extra days.",
      severity: 'medium',
      estImpact: Math.round(area * 8 + 260),
      included: false,
    }
  },
]

export function detectHiddenCosts(spec: JobSpec, volumeM3: number): HiddenCost[] {
  const ctx: Ctx = {
    spec,
    area: spec.area,
    volumeM3,
    raw: spec.rawDescription,
  }
  const order = { critical: 0, high: 1, medium: 2, low: 3 }
  return rules
    .map((r) => r(ctx))
    .filter((x): x is HiddenCost => x !== null)
    .sort((a, b) => order[a.severity] - order[b.severity] || b.estImpact - a.estImpact)
}
