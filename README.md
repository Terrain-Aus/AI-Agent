# TerrainPro Estimator

**An AI quoting assistant for Australian concreting, landscaping & earthworks contractors.**
Quote faster, price properly, and stop underquoting by catching the hidden costs that quietly eat your margin.

> Style: a dark *construction-fintech* dashboard — "Binance meets civil construction". Black/charcoal, muted green accents, mobile-first.

---

## What it does

You describe a job the way you'd say it on site:

> _"80m² exposed aggregate driveway in Mt Isa, needs prep and boxing."_

The **AI Apprentice** — a switched-on 4th-year apprentice who's blunt, practical and trade-focused — reads it, asks only the questions it still needs, then produces a full quote:

- **Low / Expected / High** price band (inc GST)
- **Materials, Labour, Machinery, Disposal & Delivery** line-item breakdowns
- **Hidden Cost Intelligence** — remote freight, reactive/black soil, rock, poor access/pumps, sealing, council crossings, spoil disposal, short-load fees, wet weather…
- **Risk contingency, profit margin & GST**
- A plain-English **quote summary** in the apprentice's voice
- One-tap **PDF export** (quote *and* tax invoice)

It also **learns**: every finished quote sharpens the apprentice's read on your real $/m² rates, your win rate, and the traps that come up most on your jobs.

## Screens

The 10 screens are delivered through a **dense, mobile-first** layout. Per-quote
views are consolidated into one **Quote Workspace** — a sticky KPI header, tabs
(Summary / Costs / Risks / Job), a sticky action bar (Save · Ask Apprentice ·
Preview), and the Apprentice as a **slide-up drawer** — so the whole workflow
stays usable on a phone on site.

| # | Screen | Where |
|---|--------|-------|
| 1 | Login | `/login` |
| 2 | Dashboard (+ Apprentice Learning) | `/` |
| 3 | New Quote builder | `/new` |
| 4 | AI Apprentice Chat | slide-up drawer (`/quote/:id/chat`) |
| 5 | Job Details | Workspace → **Job** tab (`/quote/:id/details`) |
| 6 | Hidden Cost Intelligence | Workspace → **Risks** tab (`/quote/:id/hidden-costs`) |
| 7 | Quote Preview (+ margin control) | Workspace → **Summary**/**Costs** (`/quote/:id`) |
| 8 | Export PDF / Tax Invoice | sticky action + Summary tab |
| 9 | Pricing Database | `/pricing` |
| 10 | Settings | `/settings` |
| — | Quotes list | `/quotes` |

### Screen-saving / mobile-first UI

- Above-the-fold **KPI strip**: job Total, Margin, Risk level and hidden-cost Flags first.
- **Tabs** replace long scrolling; **accordions** hide line-item detail until tapped.
- **Progressive disclosure** — headline numbers first, breakdowns behind expandable cards.
- **Bottom sheets** for the Apprentice and forms; **sticky bottom bar** for primary actions.
- Dense fintech data tiles, compact padding, icons + short labels — no giant hero sections.

## Tech stack

- **React 18 + TypeScript** (Vite)
- **Tailwind CSS** — custom construction-fintech dark theme
- **Zustand** — state, persisted to `localStorage` (Supabase-swappable)
- **React Router** — screen navigation
- **jsPDF** — client-side quote & invoice generation
- **Supabase-ready** data layer (`src/lib/supabase.ts`)
- **AI-provider-ready** apprentice (`src/lib/ai.ts`) — Claude or OpenAI, with a fully-working offline fallback

The app runs **100% offline** out of the box: a deterministic on-device estimation engine and a rule-based apprentice mean you can demo the whole workflow with **no API keys and no backend**. Supabase and a live LLM are drop-in upgrades, not requirements.

## Getting started

```bash
# 1. Install
npm install

# 2. (optional) configure cloud / AI — see .env.example
cp .env.example .env

# 3. Run
npm run dev          # http://localhost:5173

# Production
npm run build
npm run preview
```

Sign in with any email (demo mode) and start quoting.

## Configuration (all optional)

Copy `.env.example` to `.env`:

```bash
# Supabase — cloud auth + cross-device quote sync
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# AI provider for the Apprentice: "claude" | "openai" | "" (local)
VITE_AI_PROVIDER=
VITE_AI_API_KEY=
VITE_AI_MODEL=          # optional override
```

- **No vars set** → demo mode: `localStorage` persistence + on-device apprentice.
- **Supabase vars set** → auth + cloud sync (see the suggested SQL schema in `src/lib/supabase.ts`).
- **AI vars set** → the live LLM takes over the apprentice via `chatComplete()` in `src/lib/ai.ts`.

> ⚠️ For production, proxy LLM calls through a Supabase Edge Function / your own backend so the API key never ships to the browser. `src/lib/ai.ts` is written so only its internals change, not its callers.

## Project structure

```
src/
  engine/            # Pure domain logic — the quoting brain
    types.ts         #   shared domain types
    pricing.ts       #   AU rate book + location/remoteness intelligence
    estimator.ts     #   JobSpec -> full Estimate (the calculator)
    hiddenCosts.ts   #   Hidden Cost Intelligence rules engine
    apprentice.ts    #   NL parsing, gap detection & question flow
    learning.ts      #   Apprentice Learning model (learns from quotes)
  lib/
    supabase.ts      #   Supabase client (env-gated) + schema docs
    ai.ts            #   Claude/OpenAI abstraction + local fallback
    pdf.ts           #   Quote & tax-invoice PDF generation
    format.ts        #   currency / time helpers
  store/
    useStore.ts      #   Zustand store (persisted)
  components/        #   AppShell, icons, reusable UI
  screens/           #   The 10 screens
```

## How the estimate is built

1. **Parse** the rough description → structured `JobSpec` (`apprentice.ts`).
2. **Fill gaps** via the chat — area, location, ground, prep, boxing, access.
3. **Price** materials/labour/machinery/disposal/delivery off the editable rate book, with **location loadings** auto-applied (e.g. Mt Isa adds remote concrete freight, travel time and accommodation).
4. **Scan for hidden costs** — each rule adds a dollar-impact flag and a trade-voiced explanation; excluded exposure drives a **risk contingency**.
5. **Apply margin + GST**, and derive a **low/expected/high** band from the apprentice's confidence in the inputs.

All rates are editable from the **Pricing Database** screen — tune them to your suppliers and crew.

## Disclaimer

Rates are indicative 2025/26 trade figures provided as a sensible starting point. Always confirm against your own suppliers, your engineer's specification, and current site conditions before issuing a quote.

---

Built for the people on the tools. 👷
