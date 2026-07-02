# TerrainPro — Engineering Operating System

This document defines how TerrainPro is engineered. It is **governance, not
product**. Every future Claude Code session — and every human contributor —
must read and follow it before making a change.

It exists because TerrainPro is a *deterministic quoting system for real money*.
The estimating engine, the validation gate and the guardian apprentice all make
decisions a contractor trusts with their margin. Discipline in how we build is
part of the product, not overhead on top of it.

> If a request in a task conflicts with this document, stop and surface the
> conflict. Do not silently override the operating system to satisfy a one-off
> instruction.

---

## 1. Engineering principles

1. **Determinism first.** The core of TerrainPro is pure, testable, and
   reproducible. Same inputs → same outputs, every time. AI augments the
   deterministic core; it never replaces it and never front-runs it.
2. **Contracts are load-bearing.** Types and contracts encode the domain laws
   (the estimator's 7 LAWS, the guardian's advisory-only boundary). A change to a
   contract is a change to the system's guarantees — treat it as such.
3. **Small, reviewable steps.** One milestone, one branch, one PR. A change you
   cannot review in one sitting is too big.
4. **Scope is a promise.** Do exactly what the milestone asks — no more. Adjacent
   improvements, refactors and "while I'm here" edits are separate work.
5. **Isolation holds.** The `apprentice-service/` guardian package depends on
   nothing from the host app. Boundaries that exist in the code (dependency
   tests, provider interfaces, repository seams) are there on purpose — keep them.
6. **Tests are the specification.** The estimator's LAWS, the guardian's rules and
   the boundary tests define correct behaviour. If behaviour changes, a test
   changes with it, in the same PR.
7. **No invented money.** No layer fabricates prices, fees, or flat charges. Money
   comes only from the Rate service (estimator LAW 3); advisory flags carry no
   dollar authority. The LLM produces *zero* dollar figures itself.
8. **Leave the tree green.** `typecheck` and `test` pass before every PR. A red
   build is never "someone else's problem".

---

## 2. Roles

TerrainPro is built by three distinct roles. Keeping them separate is what makes
the process trustworthy — the engineer does not grade their own work, and the
architect does not hand-write the implementation.

| Role | Who | Responsibility |
| --- | --- | --- |
| **Chief Architect / merge gate** | ChatGPT | Owns architecture and the milestone plan. Defines each milestone's scope, contract shape and Definition of Done *before* implementation starts. Is the **merge gate** — a PR merges only with architect approval. |
| **Implementation engineer** | Claude Code | Implements exactly one approved milestone per branch/PR. Writes the code and its tests, keeps within scope, opens the PR, and **stops**. Does not self-merge. Does not expand scope. |
| **Independent QA** | Review chat | Independent quality review of the PR against the Definition of Done and the review checklist. Catches scope creep, contract drift, missing tests and law violations. Independence is the point — QA is a *different* context from the one that wrote the code. |

**Separation of duties is mandatory.** The implementation engineer never acts as
merge gate or as independent QA on their own work.

---

## 3. Milestone workflow

Work moves in one direction, one milestone at a time:

```
Architecture  →  One branch  →  One milestone  →  One PR  →  STOP
   (ChatGPT)      (Claude)        (Claude)        (Claude)   (await review + merge gate)
```

1. **Architecture first.** No implementation begins until the Chief Architect has
   defined the milestone: its scope, its contract surface, its Definition of Done,
   and an explicit *NOT-in-scope* list. If that definition is missing or
   ambiguous, ask — do not improvise the architecture.
2. **One branch.** Each milestone gets its own branch (see §9). Never develop a
   milestone on top of an unmerged, unrelated milestone's branch.
3. **One milestone.** A branch implements exactly one milestone. Do not roll M2C
   work into an M2B branch. Do not "get ahead" on the next milestone.
4. **One PR.** One branch produces one focused PR whose diff is only that
   milestone's work.
5. **Stop after PR.** Open the PR, write the final report (§10), and **stop**. Do
   not merge, do not start the next milestone, do not begin follow-up work.
   Merging is the architect's gate; the next milestone is a new task.

**Follow-up after merge.** If the milestone's PR is already merged and new work is
needed, that is a *fresh* change on a fresh branch from the latest default branch
— never new commits stacked on already-merged history.

---

## 4. Definition of Done

A milestone is **Done** only when *all* of the following hold:

- [ ] The change matches the architect-approved scope — nothing more, nothing less.
- [ ] Only the files the milestone requires are touched (see §6 scope control).
- [ ] `npm test` (or the package's `test` script) passes; all relevant suites are green.
- [ ] `typecheck` passes with no new errors.
- [ ] New/changed behaviour is covered by a test in the **same** PR.
- [ ] No contract or contract-version change unless the milestone explicitly calls for one (see §7).
- [ ] For guardian work: rules stay pure/deterministic; identity stays on
      `RemediationFlag.code`; no `ruleId`; no LLM duplication of deterministic rules (see §8).
- [ ] Isolation/boundary tests still pass (`apprentice-service` imports nothing from the host app).
- [ ] Docs updated only where the milestone requires (e.g. a package README milestone-status entry). No unrelated doc churn.
- [ ] The final report (§10) is written.

If any box is unchecked, the milestone is **not** Done. Do not open the PR as
"done" and do not merge.

---

## 5. PR review checklist

The independent QA reviewer (and the author, before opening) works through this:

**Scope**
- [ ] Does the diff contain *only* this milestone's work? No unrelated refactors, renames, or drive-by edits.
- [ ] Is every changed file justified by the milestone?
- [ ] Is anything from the milestone's explicit *NOT-in-scope* list present? (Reject if so.)

**Correctness**
- [ ] Do the estimator LAWS still hold (no quantity→dollars, bank/loose, Rate-only money, commercial-only markup, validation can BLOCK, audit trail)?
- [ ] Are new guardian rules pure, deterministic, structured-input only (no free-text/keyword inference, no I/O, no network)?
- [ ] Are edge cases and "no signal" states (absent field, `'unknown'`) handled as specified?

**Contracts**
- [ ] Any contract change intentional, approved, and additive-where-required (§7)?
- [ ] Is the contract version bumped only if the milestone genuinely required it?

**Tests**
- [ ] New behaviour has tests; changed behaviour has updated tests.
- [ ] Boundary/isolation tests present and passing.
- [ ] `test` and `typecheck` green.

**Hygiene**
- [ ] No new dependencies unless the milestone required them.
- [ ] No formatting-config / tooling churn unrelated to the change.
- [ ] Commit messages and PR title/body describe the milestone accurately.

---

## 6. Scope-control rules

- **Do exactly the milestone.** The task's scope — and the architect's
  *NOT-in-scope* list — are binding. When in doubt, do less and ask.
- **No opportunistic edits.** Do not refactor, rename, reformat, "tidy", or
  "improve" code the milestone didn't ask you to change, even if it's tempting or
  obviously better. Raise it separately.
- **No getting ahead.** Do not start the next milestone (e.g. M2C) inside the
  current one. Do not add fields, categories, or rules "ready for later".
- **Touch the minimum surface.** Change the fewest files needed. A large blast
  radius is a signal the scope is wrong — stop and reconcile with the architect.
- **No new product behaviour in a governance/infra task.** Governance,
  documentation, and tooling milestones do not change app logic, apprentice
  rules, or contracts.
- **Dependencies are scope.** Adding, removing, or upgrading a dependency is a
  scope decision. Don't do it unless the milestone calls for it.
- **Surface conflicts, don't absorb them.** If doing the milestone properly seems
  to require out-of-scope changes, stop and report the conflict rather than
  quietly widening scope.

---

## 7. Contract-change rules

Contracts (the types and interfaces that encode TerrainPro's guarantees —
`src/estimator` types, the `apprentice-service` `QuoteReviewRequest`,
`RemediationFlag`, `ReviewFn`, `ReviewResult`, and friends) are the most sensitive
surface in the codebase.

- **Contracts change only when a milestone explicitly authorises it.** No
  incidental contract edits.
- **Prefer additive and optional.** Extend contracts by adding *optional* fields
  so existing shapes stay valid (the M2A pattern: new optional
  `reviewItems`/`siteConditions` blocks, contract version held at `1`, all M1-shaped
  requests still pass the guards).
- **Do not bump the contract version unless required.** A version bump is a
  breaking-change signal; only the architect decides one is warranted.
- **No breaking changes without architect sign-off and a migration plan.**
  Removing/renaming/retyping an existing contract field is a breaking change.
- **Guards move with contracts.** A new contract field ships with its type guard
  and a test, in the same PR. Guards validate new blocks *only when present*.
- **Semantics are part of the contract.** "Absent = no signal" (and, for BYDA,
  `'unknown'` = no signal — never `false`, never confirmed) is a contract-level
  promise; preserve it.
- **Scope of claims stays honest.** Contract fields record only what the
  producer/operator *asserts*. TerrainPro does not verify external facts (e.g. it
  does not verify BYDA enquiries or the physical location of services) — never
  widen a field's meaning into a verification or compliance claim.

---

## 8. Apprentice (guardian) rules

The `apprentice-service/` guardian is **advisory only**. It runs after the
Validation Engine and before send/export, reads the quote request, and returns
advisory `RemediationFlag`s plus an append-only learning delta. It never mutates
quotes, quantities, pricing, RateBook, BI, the Business Profile, the Quote
Workspace, or any pipeline internals.

These rules are **non-negotiable**:

1. **Deterministic before AI.** Deterministic rules are the floor. Any AI/LLM
   review layer sits *on top of* the deterministic pass — it never replaces it,
   never runs before it, and never gates it.
2. **`RemediationFlag.code` is the stable rule identifier.** A rule's identity is
   its `code` (e.g. `HF-SPOIL`, `HF-SERVICES`, `HF-SERVICES-NOT-REQUIRED-ASSERTED`,
   `RK-ACCESS`, `RK-TRAFFIC`, `RK-WATER`). Downstream systems key off `code`;
   codes are stable and must not be renamed casually.
3. **No `rule_id` / `ruleId`.** There is no separate rule-id field and there
   never will be one. Do not add `ruleId`, `rule_id`, or any parallel identifier.
   `code` is the single identity.
4. **Rules must be pure and deterministic.** Structured-input only: no free-text
   or keyword inference, no I/O, no environment reads, no network, no external
   lookups (including no external BYDA lookup), no randomness, no clock. Same
   input → same flags, same order. Each rule reads the minimum fields it needs and
   emits at most one flag.
5. **No LLM duplication of deterministic rules.** Checks owned deterministically
   (the hard-floor `HF-*` rules, the advisory `RK-*` rules) must **not** be
   re-implemented, duplicated, second-guessed, or suppressed by an LLM layer. The
   deterministic registry is the single source of truth for those checks.
6. **Hard-floor vs advisory is structural.** Hard-floor categories force
   `dismissible: false` / `source: 'hardFloor'` via `createRemediationFlag`;
   advisory rules emit dismissible `warning`s under non-hard-floor categories and
   hardcode no assumption about the deployment's hard-floor config.
7. **Registry order is stable.** Hard-floor rules precede advisory rules; output
   order matches registry order and is deterministic.
8. **Learning deltas are append-only.** `LearningProfileDelta` is `{ appendEvents }`
   only — no update/delete/replace. The guardian never mutates existing state.
9. **Isolation is enforced by test.** `apprentice-service` imports only
   intra-package paths (plus `node:` builtins and `vitest` in tests). The boundary
   test must stay green.

---

## 9. Branch naming convention

- Format: **`claude/terrainpro-<milestone-slug>[-<suffix>]`**
- Lowercase, hyphen-separated; the slug names the milestone, not a vague theme.
  Examples: `claude/terrainpro-estimator-mvp`, `claude/terrainpro-engineering-system`.
- **One branch per milestone.** Never reuse a branch across milestones.
- **Branch off the latest default branch.** Create the branch from an up-to-date
  default branch, not from another unmerged feature branch.
- **Never push to a branch other than the one the task designates** without
  explicit permission.
- **After a merge, restart fresh.** If the milestone's PR is already merged,
  follow-up work restarts the branch from the latest default branch (same name is
  fine) — do not stack new commits on merged history.

---

## 10. Required final report format

After opening the PR (or completing a no-PR task), **stop** and report exactly:

```
Branch:        <branch name>
Commit:        <commit hash(es)>
Changed files: <list of files added/modified>
Summary:       <what the milestone did, in 1–3 sentences>
Tests run:     <commands + pass/fail; "none" if none, and why>
```

- Report faithfully. If tests failed or were skipped, say so plainly with the
  output — never report Done on a red or unverified build.
- Do not merge, do not start the next milestone, do not begin follow-up work in
  the same turn. The report is the end of the milestone.
