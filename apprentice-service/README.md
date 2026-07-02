# @terrainpro/apprentice-service

The **TerrainPro Apprentice** — a standalone **guardian service**. Advisory only.

It is invoked **after the Validation Engine** and **before send/export**, inspects a
validated quote, and returns **`RemediationFlag[]`** — nothing else. It never
mutates quotes, quantities, pricing, RateBook, BI, the Business Profile, the Quote
Workspace, or any pipeline internals. Acting on a flag is always the caller's choice.

> This is **not** the in-app OpenAI "Apprentice" chat from the app README. It is a
> separate, isolated package.

## Milestone status — M1: Types & Contracts (this package)

M1 ships **only** the contract surface:

- `RemediationFlag` — the sole output type (`remediation-flag.ts`)
- `GuardianReviewRequest` — the decoupled input DTO (`review-request.ts`)
- `ApprenticeGuardian` — the service contract + a **no-op** reference implementation
  (`guardian.ts`)
- Runtime guards for both contracts (`guards.ts`)
- Tests, including a **dependency-boundary** test that proves isolation

### Explicitly NOT in M1

- ❌ No `/review` HTTP route
- ❌ No Cloud Run wiring
- ❌ No Firestore client / persistence
- ❌ No Vertex AI / Gemini code
- ❌ No imports from the host app

The `createNoopGuardian()` reference implementation returns `[]` and contains **no**
remediation logic — real detection and the AI backend are later milestones.

## Isolation

The package depends on nothing from the host app. Source may import only
intra-package paths and `node:` builtins (tests may also import `vitest`). This is
enforced by `src/__tests__/boundary.test.ts`.

## Scripts

- `typecheck` — `tsc --noEmit -p tsconfig.json`
- `test` — `vitest run`

(During M1 these run via the repository root's already-installed `typescript` /
`vitest`; the package declares its own dev dependencies for future standalone use.)
