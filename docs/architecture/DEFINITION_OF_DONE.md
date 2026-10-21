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

This owns verification for repository work. Stabilization also follows the [program decisions](ARCHITECTURE.md#stabilization-decisions) and retained [contracts R1–R8](../stabilization/BASELINE.md#retained-contracts).

### Required commands

Choose the checks from what changed:

- **Documentation only:** For prose, glossary, agent instructions and reference examples that do not change executable behavior, use the documentation checks below. Application tests, type checks and a production build are not required. If a doc is executable input to tooling, verify that consumer too.
- **Application changes:** Source, runtime configuration, dependencies, schema, executable scripts and tests require the complete sequence below for the final candidate. Run focused checks while editing; GitHub Actions runs the complete read-only sequence for the candidate. Format locally before submission and record each required result even if an earlier check fails. Apply database and computer-use checks when their boundaries change.
- **Stabilization acceptance:** Documentation-only maintenance does not replace a task's required behavioral evidence or phase acceptance checks.

Full validation is a candidate acceptance requirement, not permission to push. Use focused local feedback during development and the [CI workflow](../ci.md) for complete candidate validation. An authorized push or review handoff may have CI pending; report that status honestly and verify the final candidate before accepting or merging it. A passing CI run for the exact commit supplies the same evidence as a local run. Historical Depot evidence may still apply to its identified commit or working-tree patch. Do not repeat the full sequence locally merely to push or because validation ran on a self-hosted runner.

Robert intentionally keeps this private, single-contributor repository on its current GitHub plan with `main` unprotected. He reviews CI results before merging. Missing paid branch protection/rulesets is not a failing check, defect or unmet acceptance requirement. Actual failed, cancelled or unavailable validation remains explicit.

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

### Verification after a fix

If verification passes except for one case, fix that case and rerun it. Add only adjacent checks whose behavior could change because of the repair. Reuse passing evidence for unaffected paths. Do not automatically replay the whole manual baseline, feature recipe or journey matrix after each fix.

Select reruns from the diff since the tested candidate, not from the entire issue or PR. Before expanding coverage, name the changed shared behavior and the additional paths it can affect in the existing work record or worker brief. A shared authorization, provider, schema or runtime change may require broader coverage of its consumers. A new commit, review round, merge/rebase or session restart alone is not a reason to repeat everything. Do not add speculative variants to an otherwise complete repair.

A full manual repeat is allowed only when a change or evidence gap indicates that it is needed. Before starting, state the justification to Robert and include it in any worker brief. Identify what invalidates prior passing proof and why focused checks cannot establish the required behavior. This requires an explanation, not another permission request. Required current-head CI runs follow the command contract above.

Bind reused evidence to its original tested revision and explain why the relevant code, driving steps, fixtures, runtime settings and role/scope inputs still match. Never relabel old evidence as a fresh run. Missing, failed and unrun observations stay explicit. A fix is accepted when its failing case and justified adjacent checks pass and applicable prior proof covers the remaining requirements.

Restart a stale owned verification environment as required by verify-trooptotask, then run the selected checks on the updated app. Restarting establishes the new candidate; it does not invalidate proof of unaffected behavior. Documentation or evidence packaging alone requires documentation validation, not a new live sweep. Changes to executable controls or driving steps require verification of the behavior they change.

Keep the complete required CI sequence for the final application candidate. Current-head CI supplies that evidence once; do not duplicate it locally. Focused repair checks and reused manual evidence supplement CI. They do not waive a required check or unverified acceptance item.

### Documentation checks

Format only touched Markdown with `npm exec prettier -- --ignore-path /dev/null --write <explicit-file-paths>` and run the corresponding `--check`; the explicit ignore override includes `docs/` without changing repository ignore rules. Check local links and heading anchors, review the affected instruction/contract consumers, and run `git diff --check`. Inspect changed examples against their owning implementation where relevant. Do not add tests that merely match prose.

### Recording evidence

Use synthetic values and unreachable provider endpoints for offline builds when environment values are required. Record the exact non-secret overrides, tool versions, candidate revision/diff, commands, exit results and material warnings in the task's work record; stabilization uses [EVIDENCE](../stabilization/EVIDENCE.md). A standalone documentation audit can use its own audit record. Never publish credentials or token-bearing URLs. Missing tooling and failed checks remain explicit. Preserve guards, scan paths, assertions and budgets: no bypasses, allowlists, skipped tests, inflated thresholds or reduced scan coverage.

Maintain one current acceptance record per task or completed phase. Consolidate accepted implementation and review attempts into the final outcome, candidate revision, meaningful checks, remaining findings and release obligations. Replace completed-work diaries and obsolete handoffs with concise summaries and exact committed permalinks to the detailed receipts. Historical failures may be superseded only by evidence covering the same failure; retain unresolved causes and unavailable checks explicitly. Temporary local paths identify where a run happened, not durable evidence or proof that raw artifacts remain available. Keep required schema/security artifacts and reproducible performance baselines with their owning records.

#### Packaging durable artifacts

Collect raw snapshots, action logs, provider/SQL readbacks, screenshots and downloads in ignored scratch space; browser runs use `.verification/evidence/verify-trooptotask/<run-name>/`. Preserve the evidence through owned cleanup. Before publication:

- Inspect and sanitize the captures, recording any redactions without changing the observed outcome. Package each run's sanitized artifacts in one `.tar.gz` archive named `<task>-<run>.tar.gz`, and upload it as an asset of the repository's `evidence` GitHub prerelease (`gh release upload evidence ARCHIVE`; create the prerelease once with `gh release create evidence --prerelease --title Evidence --notes 'Verification run archives'` if it is missing). Never commit run archives, expanded capture trees or screenshots to the checkout; they bloat every worktree and full-history CI clone. Keep baseline, final and follow-up runs distinct.
- Include an inventory inside the archive listing every payload file's original relative filename and SHA-256 of its sanitized, expanded bytes, excluding the inventory itself. Preserve payload bytes exactly, including downloaded workbooks and required schema/security or performance artifacts. Put the asset URL, archive SHA-256 and extraction/verification instructions in the existing acceptance record; the archive hash also protects the inventory. Re-extract into fresh ignored scratch space and verify the payload file set and every expanded hash against the inventory before acceptance.
- Independent acceptance examines the expanded observations alongside the complete source diff and coverage selection. Record this separately from CodeRabbit's source review; an archive checksum proves packaging integrity, not application behavior. Maintained recipes, fixtures, meaningful tests and executable SQL remain ordinary source files.

Finish the live run, final doctor and owned cleanup before publishing archives. Verification instructions participate in the candidate fingerprint. For ongoing work, adopt updated instructions or rebase only at that checkpoint, with the worktree's coordinator owning the update. Preserve the original tested revision/digest and explain later packaging or instruction-only differences; do not describe them as a fresh live run. Changed application, fixture, control or driving steps still need affected verification. Evidence from completed phases 04–08 and earlier training verification runs was retired from the tree; read it at the [pre-retirement revision](https://github.com/waffleflopper/trooptotask/tree/5fa75cf772d5a929408e97443b9cb005b4a71023/docs/stabilization), which the `refs/archive/pre-evidence-prune` ref keeps reachable on GitHub.

#### Reviewable diff

Before requesting CLI or hosted review, count all added, modified and deleted files against the intended PR base, including evidence, and inspect the review tool's actual limits. Bundle raw captures before submission and split oversized work into cohesive reviewable PRs without shrinking acceptance or excluding application source/tests. Record the reviewed base/head and actual scope; a skipped or partial review is not a clean review of the full candidate.

Documentation maintenance may use the PR body as its concise work record; it does not need a new audit file or a stabilization queue entry. Review the final diff, links, consumers and retained controls. For executable governance changes, include meaningful accepted/rejected checks against the real verifier. Do not add assertions that freeze document wording or require obsolete files to exist.

### Lower-level behavior checks

Follow [Testing strategy](TESTING.md) when adding, rewriting, pruning or reviewing tests: it defines the behavioral bar, prohibited test patterns and the justification required to keep or replace suspect tests. Cover meaningful success, denied access, replay/concurrency and failure cases where the retained contract requires them. Documentation-only changes need formatting, link and contract review, not artificial runtime tests.

### Computer-use flow evidence

For changed user journeys, exercise the affected retained flows using computer-use tools against a production-mode local app with isolated synthetic data. Record candidate, app origin, tool/browser version, fixture roles and Organization/Group scopes, steps, expected and observed outcomes, and redacted screenshots or recordings. Include relevant denied/error states, keyboard/focus behavior and persistence after reload. Follow the [local auth guide](../local-auth-testing.md) for acquisition and recovery flows.

Use [verify-trooptotask](../../.agents/skills/verify-trooptotask/SKILL.md) and its authoritative [feature map](../../.agents/skills/verify-trooptotask/features/README.md). Before an affected cutover, extend or correct the recipes and small controls, then exercise the relevant unchanged behavior against independently established requirements. Repeat affected journeys after the change and keep baseline and final observations distinct. Routine issue work covers affected features and dependencies; explicit map maintenance exercises the full map. Independent acceptance judges coverage and actual results alongside the applicable lower-level checks.

Evidence is the actual user action and observed result, identified by code version, environment, role and feature, with sanitized artifacts that survive cleanup. Direct authenticated API and SQL checks establish their own security/provider boundaries; they do not substitute for visible interaction. If a path or tool is unavailable, record the attempted path and blocker; source-mapped instructions are not live proof. Documentation-only changes do not require invented UI journeys. Release evidence covers the retained journeys even when earlier tasks could not exercise them.

These real browser journeys are end-to-end verification. The retired framework and application bypasses remain removed; verification does not require coded claims, signed receipts or a machine acceptance gate.

### Isolated database checks

Database changes require fresh migration replay and upgrade from the audited chain, plus migration/RLS contract checks. Use only a disposable local stack with synthetic fixtures, a distinct project ID and verified unused ports outside the existing 543xx/553xx/563xx stacks. Authorization already covering isolated verification is sufficient; do not request it again. Never access remote/production databases or existing local data, and never reset existing local tables as part of verification.

Before starting anything, inspect lifecycle scripts and seed configuration; disable legacy seed loading in the disposable configuration. Record the disposable working directory, project/port allocation, CLI/Postgres versions, migration range, exact setup/test/cleanup commands and results. From that isolated project context, use `npm run db:test` for the SQL contracts, ensuring its `supabase test db` calls resolve that disposable configuration, not the repository's existing stack. Fixture rollback alone does not establish isolation.

Verify both allowed and denied Organization/Group and privilege cases, effective functions/grants/triggers/foreign keys, and retained row identities and values before/after upgrade. Clean up only resources created for that verification. Record unavailable DB checks as blockers to database acceptance, never as passed. No DB changes means these checks are not applicable.

### Reproducible performance evidence

Run the [performance recipe](../../.agents/skills/verify-trooptotask/features/performance.md) only when Robert asks for a measurement, in the current request or in an issue he wrote for the task. No other verification, review, audit, phase gate or release step requires one, and an unmeasured journey is not a blocker. Work without a requested measurement makes no measured performance claim. Review a change on a measured journey's path against the [regression budgets](#regression-budgets) by reading what it does to request count, rows read, payload and repeated work, and name a likely regression in the PR.

When a measurement is requested, record before/after revisions, production build/start commands, hardware/runtime/browser versions, synthetic fixture sizes and roles, exact journey, cache state, warm-up, repetitions, units and result distribution. Use identical workloads and environments; define the budget from the task's expected usage before changing code.

Measure server/query time, network time, HTML/data payload, actual transferred JavaScript, hydration/main-thread work, request counts and interaction latency separately where relevant. Static bundle/manifest totals are dependency diagnostics, not transferred bytes or runtime speed. Missing timings stay **not measured**; fewer files, a framework change or a raised budget is not performance evidence.

#### Regression budgets

Phase 12 set these from measured distributions and expected usage. Budgets are stated at the large workload, a battalion-sized Organization of 400 active People and the largest the repairs measured. Each journey is timed to its visible result as a warm median on a production build with no network latency, for an Organization-wide actor and a Group-scoped actor. The default rule follows two kinds. A **feedback** interaction redraws data already on the page; its bound is 200 ms useful (INP good) or 1000 ms settled. A **load or result** needs a server round trip or produces a file; its bound is 1000 ms useful or settled (RAIL load and the flow-of-thought limit). A journey listed below uses its own budget, set by the repair that measured it. A measurement may never raise a budget to pass.

| Journey at large                         | Budget (ms)     | Last measured, wide / scoped                 | Source                                                                                          |
| ---------------------------------------- | --------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Calendar initial, warm and cold settled  | ≤ 1000          | warm 318 / 234, cold 445 / 365               | [D06](../stabilization/EVIDENCE.md#12-01-d06-calendar-initial-load-reports-and-assignment-save) |
| Calendar status-day report, current year | ≤ 1000          | 279 / 74                                     | D06                                                                                             |
| Calendar assignment save, confirmed      | ≤ 1000          | 112 / 69                                     | D06                                                                                             |
| Calendar range, Month paging and search  | default rule    | range 66 / 66, 3-month search 48 / 15        | D06                                                                                             |
| Personnel list, warm useful / settled    | ≤ 200 / ≤ 400   | 171 / 171 wide, 82 / 135 scoped              | [D03](../stabilization/EVIDENCE.md#12-02-d03-personnel-roster-detail-and-mutation-refresh-cost) |
| Personnel list, cold settled             | ≤ 400           | 326 / 278                                    | D03                                                                                             |
| Person detail open, useful               | ≤ 150           | 75 / 80                                      | D03                                                                                             |
| Person detail edit, settled              | ≤ 450           | 234 / 219                                    | D03                                                                                             |
| Personnel edit; import of 100 rows       | ≤ 300           | 190 / 192; 249 / 132                         | D03                                                                                             |
| Personnel filter                         | ≤ 200           | 164 / 15                                     | D03                                                                                             |
| Dashboard, warm useful / cold settled    | ≤ 1000 / ≤ 2000 | 502 / 117, 943 / 319                         | [D04](../stabilization/EVIDENCE.md#12-03-d04-dashboard-initial-and-deferred-load)               |
| Critical Tasks and Training reports      | ≤ 1000 settled  | Critical Tasks 646 / 354, Training 405 / 227 | [D05](../stabilization/EVIDENCE.md#12-04-d05-reports-large-lists-and-exports)                   |
| Briefing detail open; Training workbook  | ≤ 1000          | 166 / 57; 249 / 66                           | D05                                                                                             |
| Organization data export (28.8 MB)       | ≤ 5000          | 2799                                         | D05                                                                                             |
| Members list; platform user directory    | ≤ 1000          | 203; 60                                      | D05                                                                                             |
| Organization switch; sidebar navigation  | default rule    | switch settles 107–185, scoped useful 92     | [D02](../stabilization/EVIDENCE.md#12-base-d01-baseline), D03                                   |

Request and payload characteristics at large, where a regression is visible in review without a measurement:

- **Request path.** Identity, admission, `organizations` and membership statements took 1.8–4.2 ms of database time per page load in D02. A change must not add a server-to-self HTTP hop or a serial lookup for independent data.
- **Row visibility.** Training, Critical Tasks, availability and assignment reads decide visibility once per statement through `member_access_private.viewable_personnel(lane)` and `calendar_private.viewable_assignees()`. A new SELECT policy or read-model function on those tables must not call a definer function per scanned row.
- **Calendar.** A cold visit loads the workspace once. Availability is read for the shown days only, and a range change sends one read with one availability and one assignment page. The large wide first document is about 1.00 MB. Search sends no request.
- **Personnel.** One roster read per workspace load. Detail open does not run the Personnel workspace layout, and a Personnel mutation refreshes only the loads that own its data.
- **Reports.** The Critical Tasks report reads outside the workspace stream; its large wide document is about 364 kB.
- **Paged reads.** Every `OFFSET` reader orders by a unique key.

The load values in the table were taken before or after the D06 observer-clock correction, as each source records. The earlier clock read load times low by about 70 to 260 ms, so a fresh measurement near a budget is compared against its source's clock.

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
- Governance has no exception file. Do not add exceptions, allowlists or manifest declarations that reclassify a violation to pass governance.

## Required For Explicit Remediation Slices

- The system is less coupled or more explicit afterward than before.
- Any adjacent seams crossed by the slice are documented.
- The slice narrows drift; it does not simply move it.
- If the change implies a lasting architecture decision, update `docs/architecture/ADR_INDEX.md` for accepted decisions or [ADR guidance open candidates](ADR_GUIDANCE.md#open-decision-candidates) for unresolved decisions.
- If the remediation establishes or changes a default rule, an ADR is added or queued using `docs/architecture/ADR_GUIDANCE.md`.

## Required For Docs-Only Slices

- The docs are specific to this repo and this codebase shape.
- Contradictions are named explicitly instead of being smoothed over.
- The docs do not present desired future state as if it were already implemented.
