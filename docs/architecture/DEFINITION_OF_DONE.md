# Definition Of Done

This definition of done is for v1 work in this repo. It applies to both implementation slices and governance/documentation slices.

## Always Required

- The work reflects current v1 reality instead of inventing a cleaner architecture than the repo actually has.
- New docs clearly separate:
  - current-state truth
  - intended guardrails or direction
  - known drift or exceptions
  - deferred cleanup
- No unrelated or convenience-driven architectural drift was introduced.
- The verification contract below was followed and results were recorded honestly. A task closes only when its declared acceptance evidence exists; a pre-existing failure is not a passing gate.

## Verification Contract

This is the command and evidence contract for stabilization. Apply the [program decisions](ARCHITECTURE.md#stabilization-decisions) and retained [contracts R1–R8](../stabilization/BASELINE.md#retained-contracts).

### Required commands

Run focused checks while working. After final implementation changes, run these actual package scripts from the repository root and record each result even if an earlier check fails:

```bash
npm run format
npm run format:check
npm run lint
npm run governance:check
npm run check
npm run test
npm run build
```

`npm run test` runs retained Vitest tests. `npm run gate` combines format checking, lint, governance, Svelte/type checks and tests; it omits formatting writes and the production build and stops at the first failure. It is not the whole sequence above.

The formatter currently excludes `docs/`. For touched Markdown excluded by repository configuration, also run `npm exec prettier -- --ignore-path /dev/null --write <explicit-file-paths>` and the corresponding `--check`, without changing ignore rules. Check relative links and heading anchors in touched docs and run `git diff --check`.

Use synthetic values and unreachable provider endpoints for offline builds when environment values are required. Record the exact non-secret overrides, tool versions, candidate revision/diff, commands, exit results and material warnings in [EVIDENCE](../stabilization/EVIDENCE.md). Never publish credentials or token-bearing URLs. Missing tooling and failed checks remain explicit. Preserve guards, scan paths, assertions and budgets: no bypasses, allowlists, skipped tests, inflated thresholds or reduced scan coverage.

### Lower-level behavior checks

Follow [Testing strategy](TESTING.md) when adding, rewriting, pruning or reviewing tests: it defines the behavioral bar, prohibited test patterns and the justification required to keep or replace suspect tests. Cover meaningful success, denied access, replay/concurrency and failure cases where the retained contract requires them. Documentation-only changes need formatting, link and contract review, not artificial runtime tests.

### Computer-use flow evidence

For changed user journeys, exercise the affected retained flows using computer-use tools against a production-mode local app with isolated synthetic data. Record candidate, app origin, tool/browser version, fixture roles and Organization/Group scopes, steps, expected and observed outcomes, and redacted screenshots or recordings. Include relevant denied/error states, keyboard/focus behavior and persistence after reload. Follow the [local auth guide](../local-auth-testing.md) for acquisition and recovery flows.

Do not create or run a repository E2E/browser suite or enable an application test bypass. Existing harness removal belongs to 02-05. If tools or a safe fixture are unavailable, mark the flow **not run**, state what is missing and keep the required evidence with its owning task; lower-level tests do not turn an unobserved flow into a pass. Documentation-only changes do not require invented UI journeys. Release evidence must cover the retained journeys even if individual earlier tasks could not exercise them.

### Isolated database checks

Database changes require fresh migration replay and upgrade from the audited chain, plus migration/RLS contract checks. Use only a disposable local stack with synthetic fixtures, a distinct project ID and verified unused ports outside the existing 543xx/553xx/563xx stacks. Authorization already covering isolated verification is sufficient; do not request it again. Never access remote/production databases or existing local data, and never reset existing local tables as part of verification.

Before starting anything, inspect lifecycle scripts and seed configuration; disable legacy seed loading in the disposable configuration. Record the disposable working directory, project/port allocation, CLI/Postgres versions, migration range, exact setup/test/cleanup commands and results. From that isolated project context, use `npm run db:test` for the SQL contracts, ensuring its `supabase test db` calls resolve that disposable configuration, not the repository's existing stack. Fixture rollback alone does not establish isolation.

Verify both allowed and denied Organization/Group and privilege cases, effective functions/grants/triggers/foreign keys, and retained row identities and values before/after upgrade. Clean up only resources created for that verification. Record unavailable DB checks as blockers to database acceptance, never as passed. No DB changes means these checks are not applicable.

### Reproducible performance evidence

For performance work, record before/after revisions, production build/start commands, hardware/runtime/browser versions, synthetic fixture sizes and roles, exact journey, cache state, warm-up, repetitions, units and result distribution. Use identical workloads and environments; define the budget from the task's expected usage before changing code.

Measure server/query time, network time, HTML/data payload, actual transferred JavaScript, hydration/main-thread work, request counts and interaction latency separately where relevant. Static bundle/manifest totals are dependency diagnostics, not transferred bytes or runtime speed. Missing timings stay **not measured**; fewer files, a framework change or a raised budget is not performance evidence.

## Required When Behavior Changes

- Meaningful tests protect the changed retained behavior under the verification contract.
- The change does not create a new direct provider-boundary leak without an explicit reason.
- The change does not create a new cross-feature permission piggybacking pattern.
- Remote migration, hosted-config, or deployment follow-up is called out explicitly when relevant.

## Required When Architecture Or Authz Changes

- `docs/architecture/ARCHITECTURE.md` is updated if the default architectural path changed.
- `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md` is updated if authz or provider ownership changed.
- `docs/architecture/DRIFT_LEDGER.md` is updated if drift was reduced or newly identified; stabilization does not authorize new drift.
- [Domain language](../../CONTEXT.md#language) is updated if canonical terminology shifted.
- `docs/architecture/V1_CHANGE_INTENT.md` is updated if the slice changes the intended replacement direction for a known drift area.
- `docs/architecture/GOVERNANCE_BASELINE.json` is updated when the slice eliminates an existing provider leak or permission coupling. Do not add exceptions or reclassify a remaining violation to pass governance.

## Required For Explicit Remediation Slices

- The system is less coupled or more explicit afterward than before.
- Any adjacent seams crossed by the slice are documented.
- The slice narrows drift; it does not simply move it.
- If the change implies a lasting architecture decision, update `docs/architecture/ADR_INDEX.md` for accepted decisions or `docs/architecture/ADR_BACKLOG.md` for open candidates.
- If the remediation establishes or changes a default rule, an ADR is added or queued using `docs/architecture/ADR_GUIDANCE.md`.

## Required For Docs-Only Slices

- The docs are specific to this repo and this codebase shape.
- Contradictions are named explicitly instead of being smoothed over.
- The docs do not present desired future state as if it were already implemented.
