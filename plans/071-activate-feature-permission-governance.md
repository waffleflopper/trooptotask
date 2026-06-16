# Plan 071: Activate feature permission-coupling governance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat b3acfabb..HEAD -- scripts/check-governance.mjs src/tests/check-governance.test.ts docs/architecture/GOVERNANCE_CHECKS.md docs/architecture/GOVERNANCE_BASELINE.json docs/architecture/DRIFT_LEDGER.md plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b3acfabb`, 2026-06-14

## Why this matters

The governance docs say cross-feature permission-lane couplings must stay
explicitly documented, but the scanner only looks for couplings when the
baseline already contains at least one entry for a feature. Because
`featurePermissionCouplings` is empty today, the scanner can report "0
documented feature permission couplings" while doing no feature-family scan at
all. The guardrail should scan known feature families by default and treat the
baseline as exceptions, not as the list of families to check.

## Current state

- `scripts/check-governance.mjs` knows how to identify `critical-tasks` and
  `rating-scheme` feature-family files.
- `collectPermissionPatterns` only detects legacy `permission: '...'` and
  `requireEdit/requireView` patterns for `calendar`, `personnel`, `training`,
  and `onboarding`.
- `checkFeaturePermissionCouplings()` builds `byFeature` only from
  `baseline.featurePermissionCouplings`.
- `docs/architecture/GOVERNANCE_BASELINE.json` has
  `"featurePermissionCouplings": []`.
- `docs/architecture/GOVERNANCE_CHECKS.md` already claims known
  cross-feature permission-lane couplings are checked.

Current excerpts:

```js
// scripts/check-governance.mjs:50
function hasFeatureFamilyMatch(filePath, feature) {
	if (feature === 'critical-tasks') {
```

```js
// scripts/check-governance.mjs:68
function collectPermissionPatterns(content) {
	const matches = new Set();
	const pattern = /permission:\s*'([^']+)'|require(Edit|View)\('([^']+)'\)/g;
	const featureLanes = new Set(['calendar', 'personnel', 'training', 'onboarding']);
```

```js
// scripts/check-governance.mjs:325
const byFeature = new Map();
for (const entry of baseline.featurePermissionCouplings) {
```

```js
// scripts/check-governance.mjs:344
for (const [feature, entries] of byFeature.entries()) {
	const allowlistedPatterns = new Set(entries.map((entry) => `${entry.path}::${entry.pattern}`));
```

```json
// docs/architecture/GOVERNANCE_BASELINE.json:218
"featurePermissionCouplings": []
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Targeted governance tests | `npx vitest run src/tests/check-governance.test.ts` | exits 0 |
| Governance check | `npm run governance:check` | exits 0 and still reports 0 documented feature permission couplings unless current exceptions are found |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Scope

**In scope**:

- `scripts/check-governance.mjs`
- `src/tests/check-governance.test.ts`
- `docs/architecture/GOVERNANCE_CHECKS.md`
- `docs/architecture/GOVERNANCE_BASELINE.json`, only if the scan finds a
  current intentional exception
- `docs/architecture/DRIFT_LEDGER.md`, only if a new baseline exception needs a
  drift ID
- `plans/README.md` status row only

**Out of scope**:

- Do not change feature permissions or route policy actions in this plan.
- Do not add route-level Supabase/admin-provider scanner work; plan 059 already
  added that guardrail.
- Do not document a baseline exception unless the scanner finds a real current
  coupling and the codebase evidence shows it is intentionally tolerated.
- Do not add migrations or touch databases.

## Git workflow

- Branch: `codex/071-activate-feature-permission-governance`
- Commit style: short imperative subject. Suggested:
  `Activate feature permission governance`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define feature families independently of the baseline

Add a static governance configuration for known feature families. Start with the
families already recognized by `hasFeatureFamilyMatch`:

- `critical-tasks`
- `rating-scheme`

For each family, define the permission lanes that are considered foreign. The
scanner should ignore that feature's own lane, for example
`POLICY_ACTION_CATALOG.criticalTasks.*` inside Critical Tasks files.

The baseline should only allow specific exceptions:

```json
{
  "feature": "critical-tasks",
  "path": "src/features/critical-tasks/example.ts",
  "pattern": "POLICY_ACTION_CATALOG.training.viewRecords",
  "reason": "...",
  "driftIds": ["D-02"]
}
```

**Verify**:
`npx vitest run src/tests/check-governance.test.ts` should fail until tests and
scanner behavior are updated.

### Step 2: Expand permission-pattern detection

Extend `collectPermissionPatterns` so it detects current policy-first shapes,
not only deleted route-auth patterns. Include at least:

- `POLICY_ACTION_CATALOG.training.<action>`
- `POLICY_ACTION_CATALOG.personnel.<action>`
- `POLICY_ACTION_CATALOG.calendar.<action>`
- `POLICY_ACTION_CATALOG.onboarding.<action>`
- legacy `permission: 'training'`
- legacy `requireEdit('training')` / `requireView('training')`

Return a stable string that can be stored in the baseline, such as
`POLICY_ACTION_CATALOG.training.viewRecords`.

Do not flag `POLICY_ACTION_CATALOG.criticalTasks.*` inside Critical Tasks or
`POLICY_ACTION_CATALOG.ratingScheme.*` inside Rating Scheme.

**Verify**:
add unit tests for each detected pattern and for same-family non-detections.

### Step 3: Scan every configured feature family

Update `checkFeaturePermissionCouplings()` so it loops over the configured
feature families even when `baseline.featurePermissionCouplings` is empty.

Expected behavior:

- for each configured feature, scan every production source file matched by
  `hasFeatureFamilyMatch`,
- collect foreign permission patterns,
- fail when a pattern is not present in `featurePermissionCouplings`,
- still validate every baseline entry for real drift IDs, existing file path,
  present pattern text, and matching feature family.

**Verify**:
add a test fixture string or temporary in-test scanner call proving an empty
baseline still flags a Critical Tasks file that imports a Training policy.

### Step 4: Reconcile the live baseline

Run:

```bash
npm run governance:check
```

If it passes with `featurePermissionCouplings: []`, leave the baseline empty.
If it finds current couplings, inspect each one. Only add baseline entries when
the coupling is intentionally tolerated and has an existing or newly documented
drift-ledger rationale. Otherwise stop and report; do not fix feature policy
couplings in this governance-tooling plan.

Update `docs/architecture/GOVERNANCE_CHECKS.md` so it says the scanner checks
configured feature families by default and treats
`featurePermissionCouplings` as an exception list.

**Verify**:
`npm run governance:check` exits 0.

### Step 5: Run the full gate

Run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- Extend `src/tests/check-governance.test.ts` for policy-catalog pattern
  detection.
- Add tests proving empty-baseline scans still run for configured feature
  families.
- Run `npm run governance:check` against live source.
- Run the full repo gate.

## Done criteria

- [ ] Feature-family scanning no longer depends on existing baseline entries.
- [ ] Current policy-catalog permission references are detected.
- [ ] Same-family policy references are not false positives.
- [ ] Live governance check passes with either no current couplings or explicit,
      drift-linked baseline exceptions.
- [ ] Governance docs describe the exception-list semantics.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 071 is updated.

## STOP conditions

Stop and report back if:

- The scanner finds a real current cross-feature coupling that needs product or
  architecture judgment rather than a simple documented exception.
- Avoiding false positives requires a full TypeScript AST parser.
- A change would weaken route-level Supabase/admin-provider governance from
  plan 059.

## Maintenance notes

When new feature families get their own permission lane, add them to the static
family configuration in this checker. Reviewers should treat new
`featurePermissionCouplings` entries as temporary debt with a drift-ledger
reason, not as a normal extension point.
