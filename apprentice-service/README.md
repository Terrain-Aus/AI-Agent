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

## Isolation

The package depends on nothing from the host app — source imports only intra-package
paths (`node:` builtins and `vitest` in tests). Enforced by
`src/__tests__/boundary.test.ts`.

## Scripts

- `typecheck` — `tsc --noEmit -p tsconfig.json`
- `test` — `vitest run`

(During M1 these run via the repository root's already-installed `typescript` /
`vitest`; the package declares its own dev dependencies for future standalone use.)
