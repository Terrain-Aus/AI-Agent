# @terrainpro/apprentice-service

The **TerrainPro Apprentice** — a standalone **guardian service**. Advisory only.

It is invoked **after the Validation Engine** and **before send/export**. A review
reads the quote request, the operator's learning profile and the hard-floor config,
and returns advisory **`RemediationFlag`s** plus an **append-only** learning delta.
It never mutates quotes, quantities, pricing, RateBook, BI, the Business Profile,
the Quote Workspace, or any pipeline internals.

> This is **not** the in-app OpenAI "Apprentice" chat from the app README. It is a
> separate, isolated package.

## Milestone status — M1: Types & Contracts (this package)

M1 ships **only** the contract surface — no implementation:

- **Categories** — the closed, approved `RemediationCategory` registry
  (`categories.ts`): `spoilDisposal`, `serviceProtection`, `siteAccess`,
  `trafficManagement`, `dewatering`, `compactionTesting`, `reinstatement`,
  `mobilisation`, `weatherAllowance`, `tipFees`, `permitsAndFees`, `plantFloat`.
- **RemediationFlag** (`remediation-flag.ts`) — severity `info | warning | critical`,
  source `universal | learned | hardFloor`, `dismissible` flag, plus
  `createRemediationFlag(input, hardFloorConfig)` (pure).
- **Hard floor** (`hard-floor.ts`) — `HardFloorConfig` (never empty), default
  `spoilDisposal` + `serviceProtection`. Any hard-floor category is forced
  `dismissible: false` and `source: 'hardFloor'`. Unknown categories are rejected.
- **Learning** (`learning.ts`) — `SignalTier` (`habit | corrected | validated`),
  `SignalEvent`, `LearningProfile`, and the **append-only** `LearningProfileDelta`
  (`{ appendEvents }` only — no update/delete/replace).
- **Request** (`review-request.ts`) — read-only `QuoteReviewRequest` with
  `reviewContractVersion: 1`.
- **Review contract** (`review.ts`) — `ReviewFn` (async: `request`, `profile`,
  `config` → `Promise<ReviewResult>`) and `ReviewResult`
  (`{ flags, profileDelta }`, both readonly).
- **Branded utilities** (`branded.ts`) — `DeepReadonly`, opaque `ReviewedAmount`,
  opaque `OperatorId`.
- **Guards** (`guards.ts`) + tests, including a **dependency-boundary** test.

## Milestone status — M2A: Contract extension (additive, optional)

M2A adds **optional, additive structured input** to `QuoteReviewRequest` so later
deterministic rules (M2B) can run on structured data with **no keyword inference
on free text**. The contract version stays `1` — every new field is optional, so
M1-shaped requests remain valid and pass the guards unchanged.

- **Review items** (`review-items.ts`) — a **new** optional
  `QuoteSnapshot.reviewItems: ReadonlyArray<ReviewItem>` block. M1 had **no**
  line items and **no** item-kind discriminator; this is new contract surface,
  not an extension of existing M1 code. Each item carries a closed
  `ReviewItemKind`: `excavation`, `spoilDisposal`, `bydaCheck`,
  `serviceLocation`, `potholing`, `serviceProtection`, `compactionTesting`,
  `other`. The **producer** classifies items upstream; the guardian trusts
  `kind` and never parses `label`/`scopeNote`. (`serviceProtection` the *item
  kind* is new and distinct from `serviceProtection` the *RemediationCategory*.)
  `undefined` = no structured item data; `[]` = supplied, no items.
- **Site conditions** (`site-conditions.ts`) — a **new** optional top-level
  `siteConditions` block: `access` (`open | moderate | restricted`),
  `roadReserveAdjacent: boolean`, `wetConditions: boolean`,
  `bydaRequired: true | false | 'unknown'`, and `bydaStatus`
  (`notChecked | requested | plansReceived | locatedOnSite | notRequired | unknown`).
  **Semantic contract:** an absent field (and, for BYDA, the literal
  `'unknown'`) means **"no signal"** — never false, never confirmed.
- **Guards** — `isReviewItem`, `isReviewItemKind`, `isSiteConditions`;
  `isGuardianReviewRequest` validates the new blocks **only when present**.

### BYDA / underground services

In Australia, before residential or civil excavation/trenching, contractors
commonly check underground services (power, telecommunications, gas, water,
sewer, stormwater) through **BYDA — Before You Dig Australia** (formerly Dial
Before You Dig). The M2A fields let a quote *record* where that step stands.

> **Scope of claim:** presence of a `bydaCheck` or `serviceLocation` review item
> means only that the quote **includes or records** that allowance/step, and the
> `byda*` site-condition fields record only what the **producer/operator
> asserts**. TerrainPro does **not** verify BYDA enquiries, service plans, or
> the physical location of underground services — it only flags whether the
> quote has confirmed the BYDA/service-location step.

### Locked M2B rule design (documented here; NOT implemented in M2A)

`HF-SERVICES — underground services / BYDA not confirmed`. Emits under the
existing `serviceProtection` category (hard floor → `dismissible: false`).
Three-state, purely structural:

- **A. Satisfied / silent** — any of: `bydaStatus` ∈
  {`requested`, `plansReceived`, `locatedOnSite`}, or a review item of kind
  `bydaCheck`, `serviceLocation`, `potholing`, or `serviceProtection`.
- **B. Asserted not required / audit trail** — no satisfying condition, but the
  operator asserts `bydaRequired: false` or `bydaStatus: 'notRequired'` → emit
  `code: 'HF-SERVICES-NOT-REQUIRED-ASSERTED'`, `severity: 'info'`,
  `category: 'serviceProtection'`, `dismissible: false`. Copy meaning:
  *"Operator marked BYDA/service-location as not required for this quote."*
  (No claim that TerrainPro verified this; no legal/compliance claim.)
- **C. Unconfirmed / critical** — an `excavation` item is present, no satisfying
  condition, no not-required assertion → emit `code: 'HF-SERVICES'`,
  `severity: 'critical'`, `category: 'serviceProtection'`,
  `dismissible: false`. Copy meaning: *"Quote does not confirm the
  BYDA/service-location step."*

Deterministic rule *identity* stays on the existing `RemediationFlag.code` — no
`ruleId` field. Margin threshold is **not** added; CM-MARGIN remains deferred.

### Explicitly NOT in M2A

- ❌ No deterministic rules (M2B)  ❌ No margin threshold (CM-MARGIN deferred)
- ❌ No `ruleId` field  ❌ No external BYDA lookup or verification
- ❌ No contract-version bump  ❌ No changes outside `apprentice-service/`
- ❌ Everything in the M1 "NOT" list below

### Explicitly NOT in M1

- ❌ No `/review` HTTP route  ❌ No Cloud Run wiring  ❌ No Firestore client
- ❌ No Vertex AI / Gemini  ❌ No LLM logic  ❌ No deterministic review pass
- ❌ No `ReviewFn` implementation shipped from `src` (the no-op used in tests is
  **test/reference only**)  ❌ No imports from the host app

## Milestone status — M2B-1: deterministic hard-floor rules

M2B-1 implements **exactly two** deterministic rules on the M2A structured
input — nothing else. Rules are pure, stateless and structured-input only: no
free text, no keyword inference, no I/O, no environment reads, no network, no
external BYDA lookup. Each rule emits at most **one** flag. Rule identity stays
on `RemediationFlag.code` — still no `ruleId`.

- **`HF-SPOIL`** (`src/rules/hfSpoil.ts`) — an `excavation` review item with no
  `spoilDisposal` item → one `critical`, non-dismissible `spoilDisposal` flag.
- **`HF-SERVICES`** (`src/rules/hfServices.ts`) — the three-state machine
  locked in the M2A design above, gated on an `excavation` item. One module
  owns both `HF-SERVICES` (critical) and `HF-SERVICES-NOT-REQUIRED-ASSERTED`
  (info); they are structurally impossible to co-emit. Absent fields,
  `'unknown'` and unrecognised future values are "no signal".
- **Registry** (`src/rules/index.ts`) — deterministic order: `HF-SPOIL`, then
  `HF-SERVICES`; output order matches registry order and is stable. These
  checks are owned deterministically — a future LLM review must not duplicate
  or suppress them. `RK-ACCESS`, `RK-TRAFFIC`, `RK-WATER`, `RK-COMPACT` and
  `CM-MARGIN` are deliberately absent pending later contract support.
- **Wiring** (`review.ts`) — `deterministicReview: ReviewFn` runs the registry
  and always returns an empty learning delta.

### Explicitly NOT in M2B-1

- ❌ No RK rules  ❌ No CM-MARGIN  ❌ No contract changes  ❌ No new item kinds
- ❌ No keyword inference / free-text parsing  ❌ No external BYDA lookup
- ❌ No legal/compliance claims  ❌ No `ruleId`
- ❌ No `/review` route, Cloud Run, Firestore, Vertex AI / Gemini, LLM logic
- ❌ No changes outside `apprentice-service/`  ❌ No new dependencies

## Milestone status — M2B-2: advisory site-risk rules

M2B-2 adds **exactly three** deterministic advisory rules on the M2A
`siteConditions` structured input — nothing else. Like M2B-1 they are pure,
stateless and structured-input only: no free text, no keyword inference, no
I/O, no environment reads, no network. Each rule reads **one** producer-asserted
field, emits at most **one** flag, and keeps rule identity on
`RemediationFlag.code` — still no `ruleId`.

Unlike the M2B-1 hard-floor rules, these are **advisory**: they emit under
categories that are **not** on the default hard floor, so each flag is a
**dismissible `warning`** with `source: 'universal'`. (If a deployment adds one
of these categories to its hard-floor config, `createRemediationFlag` forces
that flag non-dismissible / `hardFloor` — the rules hardcode no assumption.)
They are **not gated on an excavation item**: an access / road-reserve / wet
condition is a site fact the operator asserted directly, independent of the line
items, so each rule reads its one field and nothing else.

- **`RK-ACCESS`** (`src/rules/rkAccess.ts`) — `siteConditions.access ===
  'restricted'` → one `warning` `siteAccess` flag. `'open'`, `'moderate'` and an
  absent field are "no signal".
- **`RK-TRAFFIC`** (`src/rules/rkTraffic.ts`) — `siteConditions.roadReserveAdjacent
  === true` → one `warning` `trafficManagement` flag. `false` and absent are "no
  signal".
- **`RK-WATER`** (`src/rules/rkWater.ts`) — `siteConditions.wetConditions ===
  true` → one `warning` `dewatering` flag. `false` and absent are "no signal".
- **Registry** (`src/rules/index.ts`) — hard-floor rules (`HF-SPOIL`,
  `HF-SERVICES`) always precede the advisory rules (`RK-ACCESS`, `RK-TRAFFIC`,
  `RK-WATER`); output order matches registry order and is stable. `RK-COMPACT`
  and `CM-MARGIN` remain deliberately absent — no compaction-required trigger
  field and no margin threshold exist in the contract yet.

### Explicitly NOT in M2B-2

- ❌ No `RK-COMPACT`  ❌ No `CM-MARGIN`  ❌ No contract changes  ❌ No new item
  kinds / site-condition fields  ❌ No new categories  ❌ No contract-version bump
- ❌ No keyword inference / free-text parsing  ❌ No external BYDA lookup
- ❌ No legal/compliance claims  ❌ No `ruleId`
- ❌ No `/review` route, Cloud Run, Firestore, Vertex AI / Gemini, LLM logic
- ❌ No changes outside `apprentice-service/`  ❌ No new dependencies

## Milestone status — M2C: review-engine hardening

M2C is a **quality/invariant milestone**: it adds tests and documentation only —
no new rules, no behaviour changes, no contract changes, no version bump.

- **Invariant suite** (`src/__tests__/m2c-invariants.test.ts`) — locks registry
  completeness (exactly the five deterministic rules), registry uniqueness (no
  duplicate `RemediationFlag.code` ownership), stable output order (registry
  order is output order), determinism (same input → identical flags across
  runs), no-mutation (deep-frozen inputs run clean), emitted-code ownership
  (every emitted code belongs to a registered rule), exact full-flag behaviour
  locks for all five rules, empty/undefined-input behaviour, and the deliberate
  absence of `RK-COMPACT`, `CM-MARGIN` and any `ruleId`/`rule_id`.
- **[`RULES.md`](RULES.md)** — the human-readable registry index: each rule's
  code, owning module, tier (hard-floor vs advisory), trigger, suppressor /
  silent conditions and introducing milestone, plus the boundary a future LLM
  review must respect (no duplication, no suppression of deterministic rules).

### Explicitly NOT in M2C

- ❌ No new rules (`RK-COMPACT`, `CM-MARGIN` stay absent)  ❌ No rule-semantics
  changes  ❌ No contract changes / version bump  ❌ No `ruleId`
- ❌ No fail-closed findings  ❌ No validation framework  ❌ No verdict enums
- ❌ No `/review` route, Cloud Run, Firestore, Vertex AI / Gemini, LLM logic
- ❌ No changes outside `apprentice-service/`  ❌ No new dependencies

## Milestone status — M3A: AI review boundary (provider-agnostic)

M3A adds the **safe AI review boundary** that a future LLM review will plug
into. It is **provider-agnostic**: real LLM integration (provider, prompt
protocol, confidence) is **deferred** to later milestones — M3A ships **no**
provider implementation, no network calls, no env vars, and tests use
**fake/mock providers only**. Deterministic review is untouched and the
**deterministic rules remain authoritative**: the AI layer runs *after* the
deterministic pass, is **advisory only**, and can never suppress, duplicate,
reorder or edit deterministic flags.

- **Locked contracts** (`src/ai/contracts.ts`) — `AiObservation`
  (`kind: observation | question | suggestion`, `message`, optional
  `relatedFlagCodes`), `AiReviewStatus`
  (`completed | unavailable | invalidOutput`), `AiReviewProvenance`,
  `AiReviewResult`, `AiReviewContext` and the injected `AiReviewProvider`
  (`review(context): Promise<unknown>` — all provider output is untrusted).
  `AiObservation` is a **separate contract** from `RemediationFlag`: AI
  observations have **no severity** (AI cannot emit critical), **no code, no
  id, no rule identifier, no category, no dismissible, no source** — they are
  advisory by construction and cannot own or duplicate deterministic
  `RemediationFlag.code` values. `relatedFlagCodes` is a *reference only*, and
  only to codes **emitted in the current deterministic review**.
- **Sanitiser** (`src/ai/sanitise.ts`) — **all-or-nothing** validation of raw
  provider output: wrong shape, invalid kind, missing/empty message, any
  ownership field, a bad `relatedFlagCodes` type, or a reference to a
  non-emitted code rejects the **entire** output (no partial filtering or
  repair). Keys are allowlisted (`kind`, `message`, `relatedFlagCodes` —
  nothing else).
- **Runner** (`src/ai/run-ai-review.ts`) — `runAiReview(request, flags,
  provider)` runs **after** deterministic review, builds the `AiReviewContext`
  (the ONLY data a provider sees) and returns an `AiReviewResult`.
  **Commercial data stays out of the AI context entirely**: no totals, no
  rates, no margins, no GST, no Business Profile, no supplier costs — review
  items are copied **without their `amount`**. Provider throw/rejection →
  `status: 'unavailable'`; malformed output → `status: 'invalidOutput'`; both
  with safe generic messages (no raw errors or stack traces) — the boundary
  itself never throws and never mutates any input.
- **Isolation scan** (`src/__tests__/ai-isolation.test.ts`) — asserts the AI
  boundary source contains no provider/cloud/network/env references
  (`gemini`, `vertex`, `googleapis`, `fetch(`, `http.request`,
  `https.request`, `process.env`).

### Explicitly NOT in M3A

- ❌ No Gemini / Vertex AI / Google Cloud / Cloud Run / Firestore
- ❌ No real LLM calls, network calls, env vars, secrets or API keys
- ❌ No prompt protocol (M3B)  ❌ No confidence fields/display (M3D)
- ❌ No new deterministic rules (`RK-COMPACT`, `CM-MARGIN` stay absent)
  ❌ No change to deterministic rule semantics, registry order or `review()`
- ❌ No verdict enums / pass-block aggregation  ❌ No fail-closed findings
- ❌ No production `/review` endpoint wiring  ❌ No contract-breaking changes
- ❌ No changes outside `apprentice-service/`  ❌ No new dependencies

## Milestone status — M3B: AI prompt protocol (provider-agnostic)

M3B adds the **provider-agnostic prompt protocol** for the future LLM review:
it defines *how* a future provider asks a model for advisory observations.
M3B **calls no model** — no provider implementation, no network, no env vars,
no secrets, no new dependencies. Deterministic review behaviour and the locked
M3A contract shapes are untouched, and the **deterministic rules remain
authoritative**.

- **Prompt contract** (`src/ai/prompt-protocol.ts`) — the locked
  `AiReviewPrompt` (`systemInstruction`, `userInstruction`, `context`) and the
  pure builder `buildAiReviewPrompt(context: AiReviewContext)`: accepts only
  the safe M3A context (already free of all commercial data), mutates nothing,
  performs no I/O, and is deterministic — same context → identical prompt.
- **Prompt rules** — the instructions tell any future model: the deterministic
  flags are **already emitted and authoritative**; never duplicate (in any
  wording) or suppress them; output is **advisory only** (`observation` /
  `question` / `suggestion`); no severity, no critical, no hard-floor
  language, no blocking/pass-fail decisions; the model **may only output
  observation objects with `kind`, `message`, and optional
  `relatedFlagCodes`** (allowlist — the prompt never enumerates rule-identity
  field names); return **only** the locked JSON shape with **no extra keys**;
  no quote/quantity/pricing/rate/Business Profile changes; no pricing advice
  based on amounts; no legal/compliance or external-verification claims (BYDA,
  services, supplier prices, site conditions); if unsure, **ask a question**
  instead of asserting. The prompt never asks the model for provenance.
- **Emitted-code guidance** — the user instruction lists exactly the codes
  emitted in the current review as the only valid `relatedFlagCodes`
  references (or says to omit `relatedFlagCodes` when none were emitted),
  matching the M3A sanitiser's reference-only validation.

### Explicitly NOT in M3B

- ❌ No Gemini / Vertex AI / Google Cloud / Cloud Run / Firestore
- ❌ No real LLM calls, provider implementation, network calls, env vars,
  secrets or API keys
- ❌ No confidence fields/display (M3D)  ❌ No learning loop
- ❌ No M3A contract shape changes (`AiObservation` unchanged — no new fields)
- ❌ No new deterministic rules  ❌ No change to deterministic rule semantics,
  registry order, `review()`, `runAiReview()` or the sanitiser
- ❌ No verdict enums / pass-block aggregation
- ❌ No production `/review` endpoint wiring
- ❌ No changes outside `apprentice-service/`  ❌ No new dependencies

## Milestone status — M3C-1: AI provider core (transport-agnostic)

M3C-1 adds the **transport-agnostic provider core** — the half of a real
provider that does not touch a network. It connects the M3B prompt protocol to
an **injected model call** and hands the model's reply back to the M3A
boundary as untrusted output. M3C-1 ships **no transport**: no network, no
cloud SDKs, no env vars, no secrets, no new dependencies — tests use fake
model calls only. Deterministic review is untouched and the **deterministic
rules remain authoritative**.

- **Model-call seam** (`src/ai/provider-core.ts`) — `AiModelCall`
  (`(prompt: AiReviewPrompt) => Promise<string>`): the single injection point
  a later milestone's real transport plugs into. The provider core never sees
  networks, credentials or model names.
- **Provider factory** — `createAiReviewProvider(callModel)` returns an
  `AiReviewProvider` whose `review(context)` builds the M3B prompt for the
  (already commercial-data-free) context, makes **exactly one** model call,
  and returns the parsed-but-unvalidated reply. Mutates nothing; no I/O of
  its own.
- **Reply parsing, no repair** — `parseAiModelReply(reply)`: JSON text parses
  to its value; anything else (prose, code-fenced JSON, scalars, a non-string
  reply) is returned **verbatim** for the M3A sanitiser to reject. No fence
  stripping, no trimming of surrounding prose, no retry — the sanitiser stays
  the **only** validator, and the boundary's failure semantics hold: a
  throwing/rejecting model call propagates → `status: 'unavailable'`; a reply
  that isn't the locked JSON shape → `status: 'invalidOutput'`.
- **Isolation** — `provider-core.ts` lives in `src/ai/`, so the M3A isolation
  scan automatically covers it (no provider/cloud/network/env references).

### Explicitly NOT in M3C-1

- ❌ No Gemini / Vertex AI / Google Cloud / Cloud Run / Firestore
- ❌ No real LLM calls, transport implementation, network calls, env vars,
  secrets or API keys
- ❌ No output repair (no code-fence stripping, no prose trimming, no retries)
- ❌ No confidence fields/display (M3D)  ❌ No learning loop
- ❌ No M3A/M3B contract shape changes (`AiObservation`, `AiReviewResult`,
  `AiReviewContext`, `AiReviewProvider`, `AiReviewPrompt` unchanged)
- ❌ No new deterministic rules  ❌ No change to deterministic rule semantics,
  registry order, `review()`, `runAiReview()`, the sanitiser or the prompt
- ❌ No verdict enums / pass-block aggregation
- ❌ No production `/review` endpoint wiring
- ❌ No changes outside `apprentice-service/`  ❌ No new dependencies

## Isolation

The package depends on nothing from the host app — source imports only intra-package
paths (`node:` builtins and `vitest` in tests). Enforced by
`src/__tests__/boundary.test.ts`.

## Scripts

- `typecheck` — `tsc --noEmit -p tsconfig.json`
- `test` — `vitest run`

(During M1 these run via the repository root's already-installed `typescript` /
`vitest`; the package declares its own dev dependencies for future standalone use.)
