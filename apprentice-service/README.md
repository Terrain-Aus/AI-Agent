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
