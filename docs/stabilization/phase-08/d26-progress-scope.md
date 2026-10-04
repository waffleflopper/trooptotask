# D26 Getting Started provider scope

This intermediate [PR #1520](https://github.com/waffleflopper/trooptotask/pull/1520) for [#1374](https://github.com/waffleflopper/trooptotask/issues/1374) repairs direct database access to Getting Started progress. Its existing policy checked only the caller's user ID; the forward migration additionally requires current Organization membership for reads and for the old/new mutation targets. Preferences already have that boundary and remain controls. This independent tenant repair precedes the application cutover because it requires Robert's manual migration step. #1374 stays open.

## Scope and affected consumers

The only product change is [`20261004000100_scope_getting_started_progress.sql`](../../../supabase/migrations/20261004000100_scope_getting_started_progress.sql): ALTER the existing ALL policy with self plus `is_org_member` in USING and WITH CHECK. Keep policy roles, table/function grants, schema, membership helper, saved rows and preferences intact. Historical rows outside current membership become hidden, not deleted. Organization administrators still have no authority over another user's personal choices. A member needs no feature-lane grant for its own dismissal/preferences.

The retained Getting Started GET/POST/DELETE route already checks membership and derives the actor. No rendered checklist or dismiss UI exists. Preference and progress providers/HTTP composition remain on their existing central paths until the full ownership cutover. No TypeScript, page, interface, DTO, registry or generated schema changes are needed for this policy-only repair. The authoritative [shell/preference recipe](../../../.agents/skills/verify-trooptotask/features/shell-preferences.md) distinguishes native, HTTP and direct SQL proof.

`is_org_member` checks membership existence. Existing fresh user and Organization suspension admission remains an independent HTTP boundary; this change neither adds suspension semantics nor claims direct-provider suspension denial. The service-role bypass stays privileged. Application request-local state, first paint, deferred chrome, saver queue/lifetime, #1420's workspace reload and stale A error feedback remain for one cohesive ownership/consumer cutover. These known failures are not accepted behavior.

## Reproduced baseline

Base is integrated `e3e14a551ffeaf9df0a12d2f6f3a9db33a3140c0` plus the archived original 36-test contract patch. Canonical `python3 scripts/ci/database.py` creates disposable `/tmp/t2t-ci-db-z30n7bhr`, project `t2t-ci-db-z30n7bhr`; API 61876, DB 63301, shadow 63428, pooler 61705, Studio 63061, Inbucket 61789, inspector 61926 and analytics 64649. Supabase CLI **2.101.0**, PostgreSQL **17.6**, local Unix Docker socket; seed disabled. Fresh replay covers **166 migrations**, `20260413001158` through `20261003000200`. No existing local stack or remote database is touched.

**Expected failure:** `account_preferences_rls.sql` executes 36 assertions; Getting Started fails exactly **1, 9, 11, 13, 17, 25, 27, 29 and 31**. An actor reads and mutates its retained foreign row, moves a row outside membership, creates progress without membership, and retains read/update/delete/insert after membership removal. Preferences controls pass. `db:test` stops on this first failing file, so this is not full prechange SQL-suite proof. The runner exits 1 and disposes its exact project.

Independent review correctly caught the original positive fixture's empty viewer overrides: it had feature-view grants despite two “without feature grants” labels. Those labels receive no such baseline credit. The final contract sets all six feature overrides to none, adds exact dismissal acknowledgment, denied UPDATE user attribution and ordinary-administrator self-only reads, for **41 behavior assertions**. The original failed observations and test bytes remain preserved rather than rewritten.

## Final proof and acceptance gates

The final canonical runner executes fresh replay plus the audited-chain populated upgrade under Node **24.21.0**. It copies executable inputs before starting; `preparation.patch` identifies the tested SQL/runner diff against `e3e14a55`. Fresh replay includes all 167 migrations. Populated upgrade holds the new migration alongside the existing audited held set, seeds current-member, peer and historical foreign progress/preferences, then applies the forward migrations through `supabase migration up --local --yes --include-all`.

`t2t-ci-db-xvrcby_c` at `/tmp/t2t-ci-db-xvrcby_c`: `api.port=58625, db.port=60363, db.shadow_port=59406, db.pooler.port=60223, studio.port=62885, inbucket.port=58308, edge_runtime.inspector_port=63025, analytics.port=58103`.

`t2t-ci-db-ukokx8ch` at `/tmp/t2t-ci-db-ukokx8ch`: `api.port=61605, db.port=59008, db.shadow_port=60634, db.pooler.port=60350, studio.port=63451, inbucket.port=62437, edge_runtime.inspector_port=58037, analytics.port=58440`.

The new 14-assertion upgrade contract compares every saved ID/JSON/timestamp before behavior mutations, including historical rows. It also compares table ACLs/RLS flags, columns, constraints, triggers, the membership helper and unchanged preference policies. Ordinary-role reads, reset, peer denial and denied Organization retargeting then prove the effective boundary on saved data; neighboring rows and reset-row identity remain intact.

**Canonical database validation PASS, exit 0.** Fresh replay passes **64 pgTAP files / 1,737 assertions**, including all 41 preference/progress assertions, the complete ordinary SQL suite and existing migration regressions; all existing SDK/provider probes pass. Populated upgrade passes **22 pgTAP files / 351 assertions**, including the new 14, then its existing provider probes. Supabase CLI 2.101.0, PostgreSQL 17.6, npm 11.19.0 and Python 3.14.7 are recorded with the Node 24.21.0 command. Fresh project `t2t-ci-db-xvrcby_c` and upgrade project `t2t-ci-db-ukokx8ch` both dispose successfully; independent exact-project Docker label reads and directory checks find no remaining containers/networks/volumes/directories.

The first repaired trial passed fresh replay/probes and 13 of 14 populated assertions. Its one metadata failure was the test sessions' different search paths deparsing the same FK as `users` versus `auth.users`. Explicit matching `public, extensions` search paths fix the comparison; the migration and behavioral expectations are unchanged. The final full canonical run above supersedes that diagnostic failure while retaining its artifacts.

Runner safety checks initially fail one existing SIGINT cancellation subcase during concurrent database validation (`Owned command processes did not become quiescent`, exit 1 instead of 130). Its unchanged lifecycle code and fake startup path do not execute migration SQL; a transient termination-observation race is plausible but not proven. After database cleanup, the unchanged affected cancellation method passes all subcases, then the full **14-test** safety suite passes. No assertion, timing budget, lifecycle logic or scan is weakened. The earlier module-style unittest invocation also could not import this standalone test's `database` module; the correct discovery command is `python3 -m unittest discover -s scripts/ci -p test_database.py`.

Local `npm run format`, touched-document format/link checks and `git diff --check` pass without unrelated changes. Independent **Standards GO / Spec GO** at `54f98ef177d8c00acf05a8e4d6c8331ebfe45f66` against base `988efcc03259c92157716c1cd6a77b7dba8a8b20` accepts all **16 paths**, all **16 expanded payloads / 1,175,388 bytes**, every hash, actual observations, affected consumers, scope selection, whole-issue remainder and release hold. Final patch/current-source and all 167 migration hash comparisons pass. This is independent source/artifact acceptance, not independent live execution or model diversity.

CodeRabbit CLI **0.8.2** completes `review --committed --base-commit 988efcc03259c92157716c1cd6a77b7dba8a8b20 --agent` at that same head with **zero findings**, reviewing every one of the 13 text files; three binary archives are explicitly excluded and receive the separate expanded acceptance above. Installed help and nine-pass doctor were inspected. The subsequent result-record delta changes only documentation and retains the executable/archive proof; independent delta review and exact-head hosted review own that changed material. Exact-published-head full application/build/database CI and completed hosted bots pass at `4e6bd963`; integration and the final documentation CLI delta are recorded in the [next deliverable receipt](d26-identity-preferences.md#prior-integration). Local proof and absent comments during an active review do not replace those gates. The prior [native/HTTP baseline](d26-shell-preferences-baseline.md) remains applicable to unchanged routes and UI, including own-member dismissal/reset and foreign-Organization denial; this SQL-only change introduces no visible user journey. It does not supersede that baseline's unresolved application failures.

**Updated-base applicability.** The branch rebases onto fetched main `988efcc03259c92157716c1cd6a77b7dba8a8b20` after D25's separate verification #1519 integrates. That change adds maintenance verification controls/records and existing-path tests, without changing production application or these SQL/runner inputs. All five tested executable hashes still match; all 167 migration bytes and the canonical runner are unchanged by the base update. Its shared TODO/EVIDENCE additions are preserved. This is evidence reuse, not a fresh run; exact-published-head CI still validates the combined candidate.

## Release gate

The [release instructions](../RELEASE.md#phase-08-d26-getting-started-progress-scope) identify the exact forward migration and manual ordering. Robert reported the migration pushed before #1520 merged at `0fa29609`; the manual merge hold is cleared on that owner report. No agent remote database operation is authorized or performed. Hosted policy state remains unverified. After this prerequisite integrates, continue #1374's grouped application cutover, never another issue.

## Durable observations

All three SQL runs are separately packaged after owned cleanup. Each contains `inventory.json` mapping every payload filename to expanded SHA-256, excluding the inventory. Root fresh extraction validates the exact payload set and every hash for all 16 payloads. Raw credential-bearing startup output is suppressed by the canonical runner; known disposable `PGPASSWORD=postgres` command text is redacted, with counts recorded. Text inspection plus JWT/bearer/key, password-field and signed-URL screening finds no issued credentials. SQL fixtures/contracts remain ordinary reviewable source files.

| Archive                                                                          | SHA-256                                                            | Payloads | Expanded bytes |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------: | -------------: |
| [d26-provider-baseline.tar.gz](d26-provider-baseline.tar.gz)                     | `70bdc9e10ef99bf6d7e37e88d1a90a1a5ce27f408f9f210558f750283d1019f1` |        5 |         32,302 |
| [d26-provider-upgrade-diagnostic.tar.gz](d26-provider-upgrade-diagnostic.tar.gz) | `99efc0e2f03a960ace7299fce817fea9431ee5f0417968b7bd0e81ed156522cb` |        4 |        417,899 |
| [d26-provider-final.tar.gz](d26-provider-final.tar.gz)                           | `a1e5021e012fd8a33020c8c195bc823b49d5c47f8d132f42cdfdee15127bca81` |        7 |        725,187 |

The final `preparation.patch` SHA-256 is `9c40402bffcb9682b3af11bd14626edec1124ced0dcdf6f64716c51ce6d72df5`. It preserves the tested five-file executable diff; `provenance.json` hashes each source file and `migration-inventory.json` hashes the 167-migration chain. Later documentation and archive packaging are not another SQL or browser run. The baseline's Node version was not captured; its SQL engine/CLI and executed contract/result are recorded, and all accepted final checks identify Node 24.

Verify an archive's hash, extract into fresh ignored scratch with `tar -xzf <archive> -C <scratch>`, and use its named root's inventory:

```python
from pathlib import Path
import hashlib, json
root = Path('<scratch>/d26-provider-final')
inventory = json.loads((root / 'inventory.json').read_text())
actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p.name != 'inventory.json'}
assert actual == set(inventory)
for name, expected in inventory.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected
```

Use the matching named root for baseline or diagnostic archives. Packaging integrity does not by itself prove the access behavior; independent acceptance examines the expanded observations and complete diff.
