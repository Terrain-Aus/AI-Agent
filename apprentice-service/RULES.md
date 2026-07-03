# Apprentice deterministic rule registry

This document is the human-readable index of every **deterministic rule** in the
TerrainPro Apprentice review engine. The executable source of truth is the
registry in [`src/rules/index.ts`](src/rules/index.ts) (`DETERMINISTIC_RULES`);
the invariants below are locked by
[`src/__tests__/m2c-invariants.test.ts`](src/__tests__/m2c-invariants.test.ts).

## Engine invariants

- **Rule identity is `RemediationFlag.code`.** There is no `ruleId` / `rule_id`
  field and there never will be one (ENGINEERING.md §8.3).
- **Registry order is output order** and is stable: hard-floor rules precede
  advisory rules, in the order listed below. Same input → same flags, in the
  same order, every run.
- **Rules are pure and deterministic.** Structured input only — no free text or
  keyword inference, no I/O, no environment reads, no network, no external BYDA
  lookup, no randomness, no clock. Rule evaluation never mutates the request.
- **Each rule emits at most one flag per review.**
- **Every emitted code belongs to a registered rule.** No other module may
  emit a `RemediationFlag` with one of the codes below.
- **Hard-floor vs advisory is structural.** `createRemediationFlag` forces
  `dismissible: false` / `source: 'hardFloor'` for any category on the
  deployment's hard-floor config; advisory rules hardcode no assumption about
  that config.

## Registry (in output order)

### 1. `HF-SPOIL` — spoil disposal / cart-away not confirmed

| | |
| --- | --- |
| **Code** | `HF-SPOIL` |
| **Owning module** | [`src/rules/hfSpoil.ts`](src/rules/hfSpoil.ts) |
| **Tier** | Hard floor (`spoilDisposal` is on the default hard floor → `critical`, non-dismissible, `source: 'hardFloor'`) |
| **Trigger** | A `reviewItems` entry of kind `excavation` exists |
| **Suppressed / silent when** | A `reviewItems` entry of kind `spoilDisposal` exists; or no `excavation` item; or `reviewItems` is absent or empty |
| **Introduced** | M2B-1 |

### 2. `HF-SERVICES` / `HF-SERVICES-NOT-REQUIRED-ASSERTED` — BYDA / service-location step

One module owns **both** codes as a single state machine; they are structurally
impossible to co-emit.

| | |
| --- | --- |
| **Codes** | `HF-SERVICES` (critical), `HF-SERVICES-NOT-REQUIRED-ASSERTED` (info) |
| **Owning module** | [`src/rules/hfServices.ts`](src/rules/hfServices.ts) |
| **Tier** | Hard floor (`serviceProtection` is on the default hard floor → non-dismissible, `source: 'hardFloor'`) |
| **Gate** | Silent unless a `reviewItems` entry of kind `excavation` exists |
| **Trigger — `HF-SERVICES`** | Excavation present, and neither satisfied nor asserted-not-required (below) |
| **Trigger — `HF-SERVICES-NOT-REQUIRED-ASSERTED`** | Excavation present, not satisfied, and the operator asserts `bydaRequired === false` or `bydaStatus === 'notRequired'` — an audit-trail `info` flag recording the operator's own call (TerrainPro does not verify it) |
| **Suppressed / silent when** | Satisfied: `bydaStatus` ∈ {`requested`, `plansReceived`, `locatedOnSite`}, or an item of kind `bydaCheck`, `serviceLocation`, `potholing` or `serviceProtection` exists. Absent fields, `'unknown'` and unrecognised future values are "no signal" — they never satisfy and never assert |
| **Introduced** | M2B-1 |

### 3. `RK-ACCESS` — restricted site access

| | |
| --- | --- |
| **Code** | `RK-ACCESS` |
| **Owning module** | [`src/rules/rkAccess.ts`](src/rules/rkAccess.ts) |
| **Tier** | Advisory (`siteAccess` is not on the default hard floor → dismissible `warning`, `source: 'universal'`) |
| **Trigger** | `siteConditions.access === 'restricted'` |
| **Suppressed / silent when** | `access` is `'open'` or `'moderate'`, or the field / `siteConditions` block is absent (absence = unknown, never restricted) |
| **Introduced** | M2B-2 |

### 4. `RK-TRAFFIC` — works adjacent to a road reserve

| | |
| --- | --- |
| **Code** | `RK-TRAFFIC` |
| **Owning module** | [`src/rules/rkTraffic.ts`](src/rules/rkTraffic.ts) |
| **Tier** | Advisory (`trafficManagement` is not on the default hard floor → dismissible `warning`, `source: 'universal'`) |
| **Trigger** | `siteConditions.roadReserveAdjacent === true` |
| **Suppressed / silent when** | The field is `false` or absent, or `siteConditions` is absent (absence = unknown, never adjacent) |
| **Introduced** | M2B-2 |

### 5. `RK-WATER` — wet ground / high water table

| | |
| --- | --- |
| **Code** | `RK-WATER` |
| **Owning module** | [`src/rules/rkWater.ts`](src/rules/rkWater.ts) |
| **Tier** | Advisory (`dewatering` is not on the default hard floor → dismissible `warning`, `source: 'universal'`) |
| **Trigger** | `siteConditions.wetConditions === true` |
| **Suppressed / silent when** | The field is `false` or absent, or `siteConditions` is absent (absence = unknown, never wet) |
| **Introduced** | M2B-2 |

## Deliberately absent

`RK-COMPACT` and `CM-MARGIN` are **not implemented** — the contract carries no
compaction-required trigger field and no margin-threshold config. Their absence
is locked by test; adding either is a future milestone, not a drive-by edit.

## Boundary with future LLM review

The checks in this registry are owned **deterministically**. A future LLM/AI
review layer (M3+) sits *on top of* the deterministic pass and:

- must **not duplicate** any of these checks (no re-implementation,
  re-derivation or second-guessing of `HF-*` / `RK-*` findings);
- must **not suppress, filter, reorder or edit** the deterministic flags — the
  deterministic verdict is final and always runs first;
- must **not emit** any `RemediationFlag.code` owned by this registry.

See ENGINEERING.md §8 ("Apprentice (guardian) rules"), which makes these
boundaries non-negotiable.
