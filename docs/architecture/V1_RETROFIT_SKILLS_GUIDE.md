# V1 Retrofit Skills Guide

This guide tells you which repo-local and existing skills to use for the v1 retrofit queue, and gives you copy-paste prompt starters in the order you should work the slices.

The goal is to keep future work grounded in current-state truth, explicit drift handling, and repo-specific guardrails.

## Working Order

Work in dependency waves rather than strict issue-number order.

1. `#614` Define the replacement authorization model and migration plan
2. `#615` Define the v1 feature permission lane map
3. `#621` Give Critical Tasks its own permission lane
4. `#620` Decide and document Rating Scheme vs Leader's Book boundaries
5. `#624` Replace clinic-era terminology with documented compatibility rules
6. `#625` Isolate and decommission demo/sandbox exceptions
7. `#616` Extract dashboard invitation and membership flows from route-local Supabase logic
8. `#617` Extract org settings member and invitation flows behind app-owned boundaries
9. `#618` Extract organization provisioning from the org/new route
10. `#626` Extract org settings ownership-transfer and destructive flows
11. `#619` Harden billing and export route/provider seams
12. `#627` Move Rating Scheme onto the approved permission boundary
13. `#622` Deepen the dashboard surface after boundary cleanup
14. `#623` Deepen calendar and duty-roster orchestration modules

## New Repo-Local Skills

| Skill | Use it for | Pair with |
| --- | --- | --- |
| `v1-retrofit-slice` | Default wrapper for any v1 retrofit issue | Everything in this guide |
| `safe-provider-boundary-change` | Route-level `locals.supabase` leak cleanup and route-thinning | `tdd`, `retrofit-slice-audit` |
| `retrofit-slice-audit` | Final pass before closing a retrofit issue or PR | Any implementation skill |
| `v1-authz-design` | HITL authz, lane, scope, preset, or boundary decisions | `grill-me`, `ubiquitous-language`, `adr-from-retrofit-decision` |
| `legacy-compat-rename` | Clinic-era terminology cleanup with compatibility preserved | `ubiquitous-language`, `clarify` |
| `trooptotask-module-deepening` | Repo-specific deep-module refactors | `improve-codebase-architecture`, `tdd`, `retrofit-slice-audit` |
| `adr-from-retrofit-decision` | Converting approved decisions into ADRs | `v1-authz-design` |

## Existing Skills To Keep Using

This is not an exhaustive list of every repo skill. These are the ones most relevant to the retrofit queue.

| Skill | Use it for |
| --- | --- |
| `grill-me` | One-question-at-a-time clarification when product or architecture intent is unclear |
| `improve-codebase-architecture` | Exploring deep-module candidates and interface options |
| `ubiquitous-language` | Tightening canonical terminology after decisions land |
| `tdd` | Test-first implementation slices |
| `to-issues` | Splitting future PRDs or follow-up plans into vertical slices |
| `clarify` | Improving user-facing copy during terminology cleanup |

## Default Prompt Shape

Use this as your base shape, then swap in the issue-specific prompt below.

```text
Use `v1-retrofit-slice` for issue #NNN. Read the issue first, then read `AGENTS.md`, the relevant docs under `docs/architecture/`, `docs/architecture/GOVERNANCE_BASELINE.json`, and `UBIQUITOUS_LANGUAGE.md` if terminology is involved. Establish current-state truth first, keep intended direction separate, stay inside the issue scope, update the affected docs and ledgers in the same slice, run the required verification, and finish with `retrofit-slice-audit` before calling the issue done.
```

## Issue Prompts

### `#614` Replacement authorization model

Recommended skills: `v1-retrofit-slice`, `v1-authz-design`, `grill-me`, `ubiquitous-language`, `adr-from-retrofit-decision`

```text
Use `v1-retrofit-slice`, `v1-authz-design`, `grill-me`, `ubiquitous-language`, and `adr-from-retrofit-decision` for issue #614. Read the issue, `plans/2026-04-21-v1-retrofit-foundation-prd.md`, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/DRIFT_LEDGER.md`, `docs/architecture/V1_CHANGE_INTENT.md`, `docs/architecture/ADR_GUIDANCE.md`, and `UBIQUITOUS_LANGUAGE.md`. Summarize the current-state truth first, then use `grill-me` one question at a time to resolve unclear authz intent. Produce an ADR-ready decision, update the relevant docs, and do not implement runtime authz changes in this slice.
```

### `#615` Feature permission lane map

Recommended skills: `v1-retrofit-slice`, `v1-authz-design`, `grill-me`, `ubiquitous-language`, `adr-from-retrofit-decision`

```text
Use `v1-retrofit-slice`, `v1-authz-design`, `grill-me`, `ubiquitous-language`, and `adr-from-retrofit-decision` for issue #615. Read the issue, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/DRIFT_LEDGER.md`, `docs/architecture/V1_CHANGE_INTENT.md`, and `UBIQUITOUS_LANGUAGE.md`. Establish the current permission-lane reality first, then resolve the intended lane map with `grill-me` one question at a time. Update the docs and ADR artifacts, but do not implement runtime lane changes in this slice.
```

### `#620` Rating Scheme vs Leader's Book boundary

Recommended skills: `v1-retrofit-slice`, `v1-authz-design`, `grill-me`, `ubiquitous-language`, `adr-from-retrofit-decision`

```text
Use `v1-retrofit-slice`, `v1-authz-design`, `grill-me`, `ubiquitous-language`, and `adr-from-retrofit-decision` for issue #620. Read the issue, the rating-scheme and leaders-book related code, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/DRIFT_LEDGER.md`, `docs/architecture/V1_CHANGE_INTENT.md`, and `UBIQUITOUS_LANGUAGE.md`. Document the current transitional reality first, then use `grill-me` one question at a time to settle the intended boundary. Do not treat current Personnel-page placement or Leader's Book compatibility wiring as permission precedent. Update the docs and ADR artifacts, but do not implement the runtime boundary change in this slice.
```

### `#624` Clinic-era terminology cleanup

Recommended skills: `v1-retrofit-slice`, `legacy-compat-rename`, `ubiquitous-language`, `clarify`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `legacy-compat-rename`, `ubiquitous-language`, `clarify`, and `retrofit-slice-audit` for issue #624. Read the issue, `UBIQUITOUS_LANGUAGE.md`, `docs/architecture/DRIFT_LEDGER.md`, and `docs/architecture/V1_CHANGE_INTENT.md`. Inventory the highest-value clinic-era terms first, preserve runtime/schema compatibility, move docs and user-facing copy toward the canonical military terms, and stop if the work turns into a mass rename or migration slice.
```

### `#625` Demo/sandbox containment

Recommended skills: `v1-retrofit-slice`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice` and `retrofit-slice-audit` for issue #625. Read the issue, `docs/architecture/ARCHITECTURE.md`, `docs/architecture/DRIFT_LEDGER.md`, `docs/architecture/V1_CHANGE_INTENT.md`, and `docs/architecture/GOVERNANCE_BASELINE.json`. Identify the highest-risk demo/sandbox exceptions, tighten containment or documentation where appropriate, and document the staged decommission path without expanding demo behavior or trying to remove everything in one pass.
```

### `#616` Dashboard invitation and membership seam

Recommended skills: `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, and `retrofit-slice-audit` for issue #616. Read the issue, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/GOVERNANCE_BASELINE.json`, and the dashboard route and related server code. Establish the current behavior first, preserve it while extracting the route-local Supabase invitation and membership flow behind app-owned boundaries, update the governance baseline if the leak changes, and run full verification before close-out.
```

### `#617` Org settings member and invitation seam

Recommended skills: `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, and `retrofit-slice-audit` for issue #617. Read the issue, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/GOVERNANCE_BASELINE.json`, and the org settings route plus related server code. Preserve current behavior while extracting invitation and member-management route logic behind app-owned boundaries. Update the drift docs and governance baseline in the same slice if the exception changes.
```

### `#618` Organization provisioning seam

Recommended skills: `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, and `retrofit-slice-audit` for issue #618. Read the issue, `docs/architecture/ARCHITECTURE.md`, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/GOVERNANCE_BASELINE.json`, and the org/new route plus related server code. Preserve the current organization bootstrap behavior while moving route-local provider orchestration behind app-owned use cases and adapters. Update the governance baseline and drift docs if the seam changes.
```

### `#626` Org settings ownership transfer and destructive flows

Recommended skills: `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, and `retrofit-slice-audit` for issue #626. Read the issue, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/GOVERNANCE_BASELINE.json`, and the destructive and ownership-transfer paths in org settings. Preserve current guardrails and user-visible behavior while extracting the route-local provider orchestration behind app-owned boundaries. Stop if the work starts redefining owner/admin semantics.
```

### `#619` Billing and export route/provider seams

Recommended skills: `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `safe-provider-boundary-change`, `tdd`, and `retrofit-slice-audit` for issue #619. Read the issue, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/GOVERNANCE_BASELINE.json`, and the relevant billing and export routes. Pick the highest-value billing seam and export seam first, preserve current behavior, extract them behind app-owned boundaries, and update the baseline and drift docs so the remaining tolerated exceptions are explicit.
```

### `#621` Critical Tasks permission lane

Recommended skills: `v1-retrofit-slice`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `tdd`, and `retrofit-slice-audit` for issue #621. Read the issue, the approved authz and feature-lane docs from #614 and #615, `docs/architecture/GOVERNANCE_BASELINE.json`, and the affected Critical Tasks routes, entities, and use cases. Implement the approved lane separation for Critical Tasks first, because its target ownership is already settled and does not depend on the Rating Scheme boundary slice. Preserve intended product behavior aside from the permission-boundary correction, update the baseline and drift docs, and stop if the target lane is still ambiguous.
```

### `#627` Rating Scheme permission boundary implementation

Recommended skills: `v1-retrofit-slice`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `tdd`, and `retrofit-slice-audit` for issue #627. Read the issue, the approved authz and boundary docs from #615 and #620, `docs/architecture/GOVERNANCE_BASELINE.json`, and the affected Rating Scheme code paths. Run this only after #620 has settled the Rating Scheme versus Leader's Book boundary. Implement the approved Rating Scheme boundary consistently, update the governance baseline and drift docs, and stop if the approved boundary is still unresolved.
```

### `#622` Dashboard module deepening

Recommended skills: `v1-retrofit-slice`, `trooptotask-module-deepening`, `improve-codebase-architecture`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `trooptotask-module-deepening`, `improve-codebase-architecture`, `tdd`, and `retrofit-slice-audit` for issue #622. Read the issue, `docs/architecture/MODULE_CONVENTIONS.md`, `docs/architecture/DRIFT_LEDGER.md`, and the dashboard surface after the boundary cleanup work is in place. Identify the shallow orchestration seams, deepen the most important ones behind thinner interfaces, preserve user-visible behavior, and update the module-conventions docs if the slice establishes a reusable pattern.
```

### `#623` Calendar and duty-roster module deepening

Recommended skills: `v1-retrofit-slice`, `trooptotask-module-deepening`, `improve-codebase-architecture`, `tdd`, `retrofit-slice-audit`

```text
Use `v1-retrofit-slice`, `trooptotask-module-deepening`, `improve-codebase-architecture`, `tdd`, and `retrofit-slice-audit` for issue #623. Read the issue, `docs/architecture/MODULE_CONVENTIONS.md`, `docs/architecture/DRIFT_LEDGER.md`, and the calendar and duty-roster surfaces. Focus on the highest-friction orchestration seams, deepen them behind thinner interfaces, preserve behavior, and stop if the work turns into feature redesign rather than module deepening.
```

## Practical Notes

- Use `v1-retrofit-slice` as the wrapper skill whenever the issue comes from the retrofit queue.
- Use `retrofit-slice-audit` at the end of every implementation slice, even if it was not the main skill doing the work.
- Use `adr-from-retrofit-decision` after a HITL decision is actually settled, not before.
- If a slice starts touching a seam outside its issue scope, stop and split follow-up work instead of letting the issue bloat.
