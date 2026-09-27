# Issue coverage before refactoring

For each selected issue, read its current acceptance criteria and approved retained contracts. Record each affected user behavior as a falsifiable expected outcome: actor, scope/preconditions, action, visible result, and saved or denied effect where relevant. Map every outcome to existing unit, SQL, and live checks. Record gaps explicitly; the running app is not the source of correct expectations.

Keep one small JSON claim set with the issue's owning artifacts, in a tracked, nonignored path. Each requirement names its exact `claim`, `behavior`, acceptance source, approved `contract`, and `coverage` inventory. An empty inventory means missing coverage. Use [Personnel](personnel-claims.json) for the file shape; [Calendar](calendar-missing-claims.json) illustrates partial lower-level coverage with no live check. Both are teaching subsets, not full issue acceptance or phase activation. Real issue sets must cover all their affected acceptance behaviors; review that mapping independently.

```bash
npm run verify:app -- check-claims path/to/issue-claims.json
```

`MISSING_COVERAGE` means add the reusable check/fixture and record the coverage before product work. `MISSING_RECEIPT` means the implemented check still needs fresh proof. The checker reuses receipt signatures, current candidate and healthy-artifact validation, and matches exact claim names. It rejects unrelated or duplicate inputs even when other receipts pass. It does not inspect GitHub, interpret prose contracts, or certify the completeness of the declared requirements.

## Adding one feature's coverage

The Organization-wide Personnel example extends coverage without changing the application:

1. Read #1351's retained full/scoped roster requirement and the approved Organization-scope rule. Existing domain and SQL checks cover the rule, but the original browser claim only covers Group scope. `check-claims` initially reported `MISSING_COVERAGE` for `personnel-organization-scope`.
2. Inspect `scripts/verification/fixtures.mjs` before adding data. It already creates the Organization-scoped `viewer`, Alpha, Bravo, unassigned and foreign Personnel. Reuse them. For genuinely missing data, extend this synthetic seed through its owned provider; keep expected rows/permissions explicit and independent of application output. Reuse `environment.py` and the owned browser; create no alternative launcher, login bypass, or shared mutable stack.
3. Register and implement the claim in `scripts/verification/claims.mjs`. Reuse `driver` for normal login and native DevTools snapshots/page evaluation. Assert the exact expected fixture IDs and consequential visible/persisted outcomes. A new name without an implementation is not coverage. `prove` already records scope, observations and signed receipts; do not hand-write a passing receipt. Add the affected Feature Map entry alongside the check.
4. With application code still unchanged, `launch`, `doctor`, and `prove personnel-organization-scope`. Pass its returned receipt path to the set checker below. A harness/fixture/selector failure is `INCONCLUSIVE`; a contract mismatch is `FAIL`. Preserve either result and diagnose it. A product defect blocks refactor readiness; repair only within authorized scope, keeping expectations intact. Mark ambiguous intent unresolved instead of inventing it.
5. Preserve the baseline candidate and receipt in the existing acceptance record. Only a passing complete baseline permits the refactor. After application edits, restart and prove the same required set on the final candidate; the baseline's old receipt must now be stale. Finish with exact-candidate repository checks and proportional independent review. `cleanup` retains evidence and removes only the worker's resources.

```bash
npm run verify:app -- prove personnel-organization-scope
# Substitute the receipt path returned by prove:
npm run verify:app -- check-claims .agents/skills/t2t-verify/references/personnel-claims.json RECEIPT
```

Keep the requirements file stable during a refactor. An approved behavior change must update the owning contract and expectations together; never delete a failed requirement or rename an unrelated claim to get a pass. Baseline and final receipts prove their respective candidates, not each other.

## Missing Calendar demonstration

```bash
npm run verify:app -- check-claims .agents/skills/t2t-verify/references/calendar-missing-claims.json GROUP_RECEIPT
```

This must return `BLOCKED`, `MISSING_COVERAGE` for `calendar-availability-persistence`, and `UNRELATED_CLAIM` for a current passing Group receipt. The current actors have no Calendar capability and no Calendar browser claim exists. Unit and SQL tests in that example remain useful partial coverage; neither those tests nor the Personnel extension verifies the Calendar journey. The example does not activate #1352 or implement any Calendar refactor.
