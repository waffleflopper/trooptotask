# Definition of Done

Work is done when its declared acceptance evidence exists and the checks below pass. A pre-existing failure is not a passing gate. Record failed, skipped and unavailable checks as such.

## Verification contract

### Required commands

Choose the checks from what changed:

- **Documentation only:** prose, glossary, agent instructions and reference examples that do not change executable behavior. Run the [documentation checks](#documentation-checks). If a document is input to a tool, verify that consumer too.
- **Application changes:** source, runtime configuration, dependencies, schema, executable scripts and tests. The final candidate needs the complete sequence below. Use focused checks while editing. Format locally before submission.

```bash
npm run format
npm run format:check
npm run lint
npm run governance:check
npm run check
npm run test
npm run build
```

`npm run gate` runs format checking, lint, governance, Svelte and type checks and tests, stopping at the first failure. It omits formatting writes and the build.

[CI](../ci.md) runs the complete read-only sequence for a candidate. A passing CI run for the exact commit is the same evidence as a local run, so do not repeat the full sequence locally just to push. Robert keeps `main` unprotected on purpose and reviews CI before merging; missing branch protection is not a failure.

Database changes also need the [isolated database checks](#isolated-database-checks). Changed user journeys also need [flow evidence](#computer-use-flow-evidence).

### Verification after a fix

If verification passes except for one case, fix that case and rerun it. Add only adjacent checks whose behavior the repair could change, and reuse passing evidence for unaffected paths. Select reruns from the diff since the tested candidate. A new commit, review round, rebase or session restart alone is not a reason to repeat everything.

A full manual repeat is allowed only when a change or an evidence gap requires it. Before starting, tell Robert what invalidates the prior proof and why focused checks cannot establish the behavior. Bind reused evidence to the revision it ran on; never relabel old evidence as a fresh run. Current-head CI is still required.

### Documentation checks

Format only touched Markdown with `npm exec prettier -- --ignore-path /dev/null --write <files>` and run the same `--check`. CI ignores `.prettierignore` for Markdown, so the explicit override matters. Check local links and heading anchors, review the instructions' consumers and run `git diff --check`. Do not add tests that match prose.

### Recording evidence

Use synthetic values and unreachable provider endpoints for offline builds. Record the candidate revision, commands, exit results, tool versions and material warnings in the task's work record; the PR body is enough for ordinary work. Never publish credentials or token-bearing URLs. Preserve guards, scan paths, assertions and budgets: no bypasses, allowlists, skipped tests, inflated thresholds or reduced scan coverage.

#### Packaging durable artifacts

Collect raw snapshots, logs, readbacks, screenshots and downloads in ignored scratch space; browser runs use `.verification/evidence/verify-trooptotask/<run-name>/`. Before publication:

- Sanitize the captures and record redactions without changing the observed outcome. Package each run in one `<task>-<run>.tar.gz` and upload it to the repository's `evidence` prerelease (`gh release upload evidence ARCHIVE`; create it once with `gh release create evidence --prerelease --title Evidence --notes 'Verification run archives'`). Never commit archives, capture trees or screenshots.
- Include an inventory inside the archive with each payload file's relative name and SHA-256. Put the asset URL, archive SHA-256 and extraction instructions in the work record. Re-extract into fresh scratch space and verify every hash before acceptance.

#### Reviewable diff

Before requesting review, count all added, modified and deleted files against the PR base and compare with the review tool's limits. Split oversized work into cohesive PRs without shrinking acceptance. A skipped or partial review is not a clean review of the full candidate.

### Lower-level behavior checks

Follow the [testing strategy](TESTING.md) when adding, rewriting, pruning or reviewing tests.

### Computer-use flow evidence

For changed user journeys, drive the affected flows with [verify-trooptotask](../../.agents/skills/verify-trooptotask/SKILL.md) and its [feature map](../../.agents/skills/verify-trooptotask/features/README.md) against a production-mode local app with synthetic data. Derive expected results from the requirement, not from what the app does. Keep baseline and final observations distinct. Record candidate, role and scope, steps, expected and observed results, and sanitized artifacts. Include denied and error states, keyboard and focus behavior, and persistence after reload where relevant.

Direct API and SQL checks prove their own boundaries; they do not replace visible interaction. If a path is unreachable, record the attempt and the blocker. Documentation-only changes need no invented journeys.

### Isolated database checks

Database changes need fresh migration replay and upgrade from the existing chain, plus the SQL contract and RLS checks (`npm run db:test`). Use only a disposable local stack with synthetic data, a distinct project ID and unused ports outside the existing 543xx, 553xx and 563xx stacks. Disable legacy seed loading in the disposable configuration and make sure `supabase test db` resolves to it. Never touch remote databases or existing local data, and never reset existing local tables.

Verify allowed and denied Organization, Group and privilege cases, effective functions, grants, triggers and foreign keys, and retained row identities and values before and after upgrade. Clean up only what the check created. An unavailable database check blocks database acceptance; it never passes.

A completed schema change that needs a remote migration must be called out to Robert before merge. Never run it as part of verification.

### Reproducible performance evidence

Run the [performance recipe](../../.agents/skills/verify-trooptotask/features/performance.md) only when Robert asks for a measurement. Without one, make no measured performance claim. Review any change on a measured journey's path against the [regression budgets](#regression-budgets) by reading what it does to request count, rows read, payload and repeated work, and name a likely regression in the PR.

When a measurement is requested, record before and after revisions, production build and start commands, hardware, runtime and browser versions, fixture sizes and roles, the exact journey, cache state, warm-up, repetitions, units and the result distribution. Use identical workloads and environments. Measure server, network, payload, transferred JavaScript, main-thread work, request counts and interaction latency separately where relevant. Missing timings stay **not measured**. Fewer files, a framework change or a raised budget is not performance evidence.

#### Regression budgets

Budgets apply at the large workload: an Organization of 400 active People. Each journey is timed to its visible result as a warm median on a production build with no network latency, for an Organization-wide actor and a Group-scoped actor. The default rule: a **feedback** interaction that redraws data already on the page is bounded at 200 ms useful or 1000 ms settled; a **load or result** that needs a server round trip or produces a file is bounded at 1000 ms useful or settled. A journey listed below uses its own budget. Never raise a budget to pass.

| Journey at large                         | Budget (ms)     | Last measured, wide / scoped                 |
| ---------------------------------------- | --------------- | -------------------------------------------- |
| Calendar initial, warm and cold settled  | ≤ 1000          | warm 318 / 234, cold 445 / 365               |
| Calendar status-day report, current year | ≤ 1000          | 279 / 74                                     |
| Calendar assignment save, confirmed      | ≤ 1000          | 112 / 69                                     |
| Calendar range, Month paging and search  | default rule    | range 66 / 66, 3-month search 48 / 15        |
| Personnel list, warm useful / settled    | ≤ 200 / ≤ 400   | 171 / 171 wide, 82 / 135 scoped              |
| Personnel list, cold settled             | ≤ 400           | 326 / 278                                    |
| Person detail open, useful               | ≤ 150           | 75 / 80                                      |
| Person detail edit, settled              | ≤ 450           | 234 / 219                                    |
| Personnel edit; import of 100 rows       | ≤ 300           | 190 / 192; 249 / 132                         |
| Personnel filter                         | ≤ 200           | 164 / 15                                     |
| Dashboard, warm useful / cold settled    | ≤ 1000 / ≤ 2000 | 502 / 117, 943 / 319                         |
| Critical Tasks and Training reports      | ≤ 1000 settled  | Critical Tasks 646 / 354, Training 405 / 227 |
| Briefing detail open; Training workbook  | ≤ 1000          | 166 / 57; 249 / 66                           |
| Organization data export (28.8 MB)       | ≤ 5000          | 2799                                         |
| Members list; platform user directory    | ≤ 1000          | 203; 60                                      |
| Organization switch; sidebar navigation  | default rule    | switch settles 107–185, scoped useful 92     |

Request and payload rules at large, where a regression is visible in review without a measurement:

- **Request path.** Identity, admission, `organizations` and membership statements take a few milliseconds of database time per page load. Do not add a server-to-self HTTP hop or a serial lookup for independent data.
- **Row visibility.** Training, Critical Tasks, availability and assignment reads decide visibility once per statement through `member_access_private.viewable_personnel(lane)` and `calendar_private.viewable_assignees()`. A new SELECT policy or read-model function on those tables must not call a definer function per scanned row.
- **Calendar.** A cold visit loads the workspace once. Availability is read for the shown days only, and a range change sends one read with one availability and one assignment page. The large wide first document is about 1.00 MB. Search sends no request.
- **Personnel.** One roster read per workspace load. Detail open does not run the Personnel workspace layout, and a Personnel mutation refreshes only the loads that own its data.
- **Reports.** The Critical Tasks report reads outside the workspace stream; its large wide document is about 364 kB.
- **Paged reads.** Every `OFFSET` reader orders by a unique key.

## When behavior, architecture or authorization changes

- Meaningful tests protect the changed behavior.
- No new provider-boundary leak and no new cross-feature permission borrowing.
- Update [Architecture](ARCHITECTURE.md) when the default architectural path changes, [Authorization and provider boundaries](AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md) when authorization or provider ownership changes, and [CONTEXT.md](../../CONTEXT.md#language) when canonical terms change.
- Add an ADR only for a still-current, surprising and hard-to-reverse decision; see the [ADR index](ADR_INDEX.md).
- Call out any remote migration, hosted configuration or deployment follow-up.
