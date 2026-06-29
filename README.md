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

It also **learns** — two loops:

- **Apprentice Learning** (from quotes): your real $/m² rates, win rate, and the traps that come up most.
- **Apprentice Memory** (from *completed-job debriefs*): once a job is won and done, log the actuals — final cost, what you got paid, which flagged hidden costs actually hit, and any surprises. The apprentice then calibrates: how far your estimates run over, your realised margin, which warnings reliably become real costs, and whether a region runs hot. Those learnings surface on the dashboard **and** are fed into the live LLM's context so future quotes are grounded in what actually happened, not just what you quoted.

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
- **Real streaming AI Apprentice** via the **OpenAI Responses API**, behind a server-side proxy, with a deterministic on-device fallback

The app runs **100% offline** out of the box: a deterministic on-device estimation engine and a rule-based apprentice mean you can demo the whole workflow with **no API keys and no backend**. Supabase and the live LLM apprentice are drop-in upgrades, not requirements.

## Business Profile — the commercial source of truth

A guided **Business Setup wizard** (`/business`) where the contractor configures
the numbers behind every quote, across five areas:

1. **Labour** — roles, cost/hr vs charge/hr, overtime & weekend multipliers, minimum billable hours (with a live per-role margin readout).
2. **Plant & Equipment** — machines, operating cost vs charge-out, float (mobilisation), attachments, productivity defaults.
3. **Materials** — cost rates, default supplier, waste %, units, and per-region price overrides.
4. **Subcontractors** — cartage, concrete pumps, traffic control, skip bins and others.
5. **Billing Rules** — minimum call-out, half/full-day rates, travel charging, fuel surcharge, weekend & public-holiday multipliers.

It works as a step-by-step wizard on first run and as an editable profile after.
On save the profile **projects into the engine rate book** (`deriveRateBook`,
`src/engine/business.ts`) — the same `RateBook` every quote already consumes — so
configuring it here updates pricing everywhere **without changing the estimator or
the Quote Workspace**.

## The Commercial Review — TerrainPro's signature moment

The point of TerrainPro isn't a pretty dashboard — it's the *operating system of a
construction business*: every screen answers "does this help me make money or avoid
losing it?". When a quote finishes, the apprentice produces a **Commercial Review**
(`src/engine/review.ts`) at the top of the Summary tab:

- **Profit-first metrics above the fold**, always: Quote Total · Margin · AI
  Confidence · Risk · Hidden Cost Count · **Profit at Risk**.
- **A verdict** — `STOP` / `REVIEW` / `GOOD TO SEND` — driven by uncovered risk,
  unconfirmed ground, and how much margin is exposed.
- **A proactive "you've forgotten…" checklist** that stops mistakes before they
  cost money: excluded hidden costs, unconfirmed ground/access, and commonly-missed
  line items (pump clean-out, washout area, expansion joints, site access).
- **The dollars it protects** — "fixing these protects ~$1,550 of profit".

It's decision-first: the contractor sees the verdict and what to fix, not just a
number. That's the feature meant to make them trust the software.

## The AI Apprentice (live LLM)

Set `OPENAI_API_KEY` and the apprentice becomes a **real, streaming LLM** (OpenAI
Responses API) instead of the on-device flow — the chat UI is identical either way.

**Architecture (provider-swappable, key stays server-side):**

```
 Browser (ApprenticeDrawer)
   │  POST /api/apprentice/stream  ── conversation + context (quote, spec,
   │  ◄── SSE: text / chips / spec / ready / done       ratebook, prefs, prior quotes)
   ▼
 Server proxy  (Vite middleware: server/handler.ts)      ← reads OPENAI_API_KEY here only
   │   runApprentice()  (server/apprentice.ts)
   │     • system prompt + persona + grounding context
   │     • AssistantProvider.run() with function-calling tool loop
   ▼
 Provider (server/llm/*)  OpenAIResponsesProvider │ MockProvider
   │   model calls tools ▼
 Engine-backed tools:  price_job · update_job · offer_quick_replies
       └─ price_job runs the REAL estimator + hidden-cost engine
```

Why it's built this way:

- **Never invents pricing.** The model produces *zero* dollar figures itself — every
  number comes from the `price_job` tool, which runs the same deterministic
  `estimate()` + hidden-cost engine the rest of the app uses. If required inputs
  (area, location, ground) are missing, the tool returns `missingFields` and the
  apprentice asks clarifying questions instead of guessing.
- **Full context.** Each turn the client sends the current quote, job spec, rate
  book, user preferences and prior-quote summaries; the engine (pricing + hidden
  costs) is available as tools.
- **Streaming.** Server-Sent Events stream tokens straight into the chat bubble.
- **Per-quote history.** The conversation is stored on each quote and replayed to
  the model every turn.
- **Swappable provider.** One interface — `AssistantProvider` (`server/llm/types.ts`).
  Swapping OpenAI for another vendor is a single new class; nothing else changes.
- **Secure keys.** `OPENAI_API_KEY` is read only by the Node/Vite middleware and is
  **never** prefixed with `VITE_`, so it is never bundled into the browser.

Provider selection (`AI_PROVIDER`): `openai` (default when a key is present) ·
`mock` (deterministic, offline — for dev/tests) · `local` (disable the server
brain; client uses the on-device apprentice). With no key set it auto-falls back
to `local`, so the app always works.

> For a hosted deployment, move the same `server/` handler into a Supabase Edge
> Function or your own API route — the client and provider code are unchanged.

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
# AI Apprentice (server-side — NEVER prefixed VITE_, so never sent to the browser)
AI_PROVIDER=openai          # "openai" | "mock" | "local"
OPENAI_API_KEY=             # your key — read only by the server proxy
AI_MODEL=gpt-4o             # optional override

# Supabase — cloud auth + cross-device quote sync (client anon key)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- **No vars set** → demo mode: `localStorage` persistence + on-device apprentice.
- **`OPENAI_API_KEY` set** → the live streaming apprentice (OpenAI Responses API) takes
  over via the server proxy. The key stays on the server.
- **`AI_PROVIDER=mock`** → deterministic streaming apprentice for offline dev/tests.
- **Supabase vars set** → auth + cloud sync (see the suggested SQL schema in `src/lib/supabase.ts`).

> ⚠️ The key is read only by the Node/Vite server middleware (`server/`) and is never
> bundled into the client. For a hosted deployment, move the same handler into a
> Supabase Edge Function or your own API route.

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
    apprenticeProtocol.ts # (in lib) client⇄server event/context types
  lib/
    supabase.ts      #   Supabase client (env-gated) + schema docs
    apprenticeClient.ts #  browser SSE client for the live apprentice
    pdf.ts           #   Quote & tax-invoice PDF generation
    format.ts        #   currency / time helpers
  store/
    useStore.ts      #   Zustand store (persisted)
  components/        #   AppShell, ApprenticeDrawer, icons, reusable UI
  screens/           #   The 10 screens

server/              # Server-side AI proxy (Node — key never reaches client)
  vitePlugin.ts      #   mounts /api/apprentice in dev & preview
  handler.ts         #   SSE handler + health; provider factory
  apprentice.ts      #   system prompt, engine-backed tools, tool loop
  llm/
    types.ts         #   AssistantProvider interface (swappable)
    openai.ts        #   OpenAI Responses API — streaming + function calls
    mock.ts          #   deterministic offline provider
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
