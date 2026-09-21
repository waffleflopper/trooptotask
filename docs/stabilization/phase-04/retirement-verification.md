# Atomic commercial schema retirement verification

Phase 04 / D02 [#1310](https://github.com/waffleflopper/trooptotask/issues/1310), leaf **04-02a**. This is local synthetic verification. The final preflight/release and full-child checkpoint are recorded under [04-02b](../EVIDENCE.md#task-04-02b--final-owner-preflight-and-d02-acceptance); this procedure preserves the 04-02a database evidence. Production cleanup is **PENDING OWNER EXECUTION**.

## Candidate and owned boundary

[The forward migration](../../../supabase/migrations/20260921000100_retire_commercial_schema.sql) embeds D01's reviewed catalog manifest/assertions so applied history never depends on mutable documentation. The assertion body differs only in requiring full visibility without a read-only transaction. Five table locks precede the assertions; eight exact RPCs, four tables and eight Organization columns retire with restrictive drops in a single transaction. The [release notice](../RELEASE.md#billing-schema-local-cutover--04-02a) and [owner preflight](owner-preflight.md) describe the mandatory controlled change window and external prerequisites. No CASCADE, conditional drop, compatibility stub or shared-data cleanup is introduced.

Delete the retired-only `organization_billing_snapshots_rls.sql`, six retired-RPC privilege assertions, and the unused admission transport fixture. Keep all other privilege/admission tests, adversarial commercial exclusion tests and stored platform `billing` identities. [The target contract](../../../supabase/tests/commercial_schema_retirement.sql) checks absence of relations/fields/RPC overloads through PostgreSQL, including removal of the anonymous ledger writers. Existing suites retain provisioning, invitation, suspension, tenant/Group, export and Calendar behavior coverage.

## Reproduction and isolation

Inspect package lifecycle, configuration and the [canonical database contract](../../architecture/DEFINITION_OF_DONE.md#isolated-database-checks) first. Use the [D01 setup procedure](replay-baseline.md) in two **new** workdirs/projects with distinct verified unused IPv4/IPv6 ports. Never reuse/reset these recorded allocations. Do not copy seed data, environment files or remote links; retain seed `enabled=false`, `sql_paths=[]`, the pinned Postgres image `17.6.1.155` and minimal PATH/HOME/USER/XDG_RUNTIME_DIR environment. Prepend the installed npm 11.12.1 executable directory to PATH; the machine default npm is newer.

Recorded allocations:

| Path / project                                                    | Ports                     | Inputs                                                                                |
| ----------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `/tmp/t3-phase04-02a-upgrade/isolated` / `t3-phase04-02a-upgrade` | 61220–61227, 61229, 25283 | D01's 156 immutable inputs, then the reviewed forward migration and target SQL suites |
| `/tmp/t3-phase04-02a-fresh/isolated` / `t3-phase04-02a-fresh`     | 61320–61327, 61329, 25383 | [157 reviewed target inputs](retirement-inputs.sha256)                                |

For the upgrade setup, reproduce D01 inputs from merged base `584af3797dae92c42968d69ab8e6ad279f955836` in a separate temporary source export. Verify the original [input manifest](replay-inputs.sha256); do not regenerate it to hide drift. For fresh setup, use the current reviewed target and `retirement-inputs.sha256`. Every original migration/template/package/config input must still match D01. The only changed prior input is `sensitive_rpc_privileges.sql`; the retired billing suite is deleted, and one migration/one SQL suite are added. Save exact source/copied hashes, transformed configuration and Docker allocation inventories as in D01. Setup substitutions use `old + 4900` / inspector 25283 for upgrade and `old + 5000` / inspector 25383 for fresh.

Start each with `supabase start --workdir <owned-workdir>`, retaining private raw logs outside Git. Verify the exact container binding before any `docker exec`. Against only the owned upgrade database:

1. Apply [upgrade-fixture.sql](upgrade-fixture.sql), capture [upgrade-snapshot.sql](upgrade-snapshot.sql), and copy [upgrade-baseline.test.sql](upgrade-baseline.test.sql) into its SQL test directory. Run all original suites with `npm run db:test` **from that disposable workdir**.
2. Copy the new retirement contract there and run it before migration: all three absence assertions must fail. This proves detection rather than inferring it from passing output.
3. Run `python docs/stabilization/phase-04/retirement.test.py <owned-workdir> <new-result.json>` from the repository. It executes the actual migration with commit replaced by rollback, then 15 transactional schema/dependency faults and a late DDL failure after the destructive statements. Every fault must reject for the expected reason, the reviewed target manifest/dependencies must still pass afterward, and all 69 pre-retirement row captures must remain identical. This is not a full unrelated-catalog equality claim.
4. Copy the one reviewed migration and exact current SQL suites into this invocation's disposable workspace; retain the fixture-specific probe. Apply with `supabase migration up --local --workdir <owned-workdir>`. This records the genuine CLI migration ledger. No hand-inserted migration receipt.
5. Run `npm run db:test` from the upgrade workspace, then capture all rows again. Compare this run's before/after maps exactly, allowing only four commercial relation keys and eight commercial Organization fields to disappear. Sort rows by their complete remaining JSON only to account for ordering after column removal. Compare every retained field, timestamp, nested JSON, identity, relationship and empty relation; counts alone are insufficient.

Fresh startup must replay all 134 migrations from empty to the same target. Run all current SQL suites from its isolated workdir. No pre-retirement populated fixture is applied to the retired schema; those fixture statements deliberately reference historical fields.

## Real artifact generation

Use the unchanged [generator](generate-artifacts.py) against each verified target:

```bash
python docs/stabilization/phase-04/generate-artifacts.py /tmp/t3-phase04-02a-upgrade/isolated /tmp/t3-phase04-02a-upgrade/target
python docs/stabilization/phase-04/generate-artifacts.py /tmp/t3-phase04-02a-fresh/isolated /tmp/t3-phase04-02a-fresh/target
```

It verifies migration contents, exact ledger, project/port/seed/link isolation and runs installed Supabase types/schema introspection plus the complete catalog query. Compare fresh and upgrade SQL/types byte-for-byte. Catalog comparison must preserve definitions, bodies, ACLs and logical dependencies; explain any replay-specific internal FK/TOAST identifiers individually, never suppress arbitrary differences.

Package generated `database-baseline.types.ts` as `database-target.types.ts`, `schema-baseline.sql` as `schema-target.sql`, and catalog as `catalog-target.json`; only normalize trailing linefeeds as in D01. Keep every D01 baseline artifact unchanged. These target artifacts are review evidence, not app imports or migration inputs. Check generated TypeScript with the installed compiler. Run all seven canonical repository commands including production build with synthetic unreachable provider settings; validate Markdown/links and whitespace separately.

## Cleanup and evidence

Stop only each newly created project with `supabase stop --workdir <owned-workdir> --project-id <owned-project> --no-backup`. Confirm zero owned containers/volumes/networks and unchanged pre-existing container identities/states. Never use `--all` or existing local stacks. Retain raw command/log/hash receipts privately; publish only synthetic reviewed results.

Actual results belong in [EVIDENCE](../EVIDENCE.md#task-04-02a--atomic-retirement-and-verified-target) and `retirement-result.json`. Missing checks remain blocked, never inferred from this procedure. No repository E2E, browser bypass, remote database/provider action, Git publication or merge is authorized here.
