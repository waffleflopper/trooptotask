---
name: v1-retrofit-slice
description: Runs a TroopToTask v1 retrofit issue from current-state truth through docs, drift, baseline, and verification. Use when working any issue from the v1 retrofit queue or a future v1 remediation slice touching architecture, authz, provider boundaries, terminology, or module shape.
---

# V1 Retrofit Slice

Use this as the default wrapper for TroopToTask v1 retrofit work.

## Quick start

1. Read the issue first.
2. Read `AGENTS.md`.
3. Read the relevant retrofit docs:
   - `docs/architecture/ARCHITECTURE.md`
   - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
   - `docs/architecture/MODULE_CONVENTIONS.md`
   - `docs/architecture/DRIFT_LEDGER.md`
   - `docs/architecture/V1_CHANGE_INTENT.md`
   - `docs/architecture/GOVERNANCE_BASELINE.json`
   - `UBIQUITOUS_LANGUAGE.md`
4. State the current-state truth before proposing changes.

## Slice types

Classify the issue before doing work:

- decision slice
- provider-boundary remediation
- feature-lane remediation
- module-deepening
- terminology cleanup
- deprecated-exception containment

Load companion skills based on that classification:

- decision slice: `v1-authz-design`, `grill-me`, `ubiquitous-language`
- provider-boundary remediation: `safe-provider-boundary-change`, `tdd`
- module-deepening: `trooptotask-module-deepening`, `improve-codebase-architecture`, `tdd`
- terminology cleanup: `legacy-compat-rename`, `ubiquitous-language`
- close-out: `retrofit-slice-audit`

## Workflow

1. Summarize current-state truth from code and docs.
2. Name the drift IDs the issue touches.
3. Name what is in scope and what must stay out of scope.
4. Preserve behavior unless the issue explicitly authorizes behavior change.
5. Update docs in the same slice when the seam changes:
   - drift ledger
   - change-intent doc
   - ubiquitous language
   - governance baseline
   - ADR backlog or ADR file when relevant
6. Run:
   - `npm run format`
   - `npm run lint`
   - `npm run governance:check`
   - `npm run check`
   - `npm run test`
7. Finish with a retrofit slice audit before calling the issue done.

## Hard guardrails

- Do not treat implementation drift as intended product behavior without checking docs and issue context.
- Do not back-port v2 nouns into v1 current-state material.
- Do not leave a changed route/provider exception undocumented.
- Do not leave a changed permission coupling undocumented.
- If the issue runs into a bigger seam than authorized, stop and split follow-up work.
