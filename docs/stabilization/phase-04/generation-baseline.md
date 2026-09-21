# Reproducible pre-retirement generation

Phase 04 / [D01 #1309](https://github.com/waffleflopper/trooptotask/issues/1309), leaf **04-01b-02**. These are introspection artifacts of the immutable local replay, including its still-present commercial objects. They are review inputs for D02, not application imports or a migration to apply. The populated upgrade fixture and owner preflight remain **04-01c**.

## Artifacts and boundaries

- [database-baseline.types.ts](database-baseline.types.ts): Supabase CLI TypeScript output for `public`; 68 tables, 799 row columns, 92 RPC names / 94 overload signatures, four enums, no views.
- [schema-baseline.sql](schema-baseline.sql): CLI schema-only dump for `public`; all 103 function signatures, 68 tables, and their definitions, constraints, policies, grants and other emitted schema objects. Never run this snapshot as a migration. Immutable migrations remain the replay authority.
- [catalog-baseline.json](catalog-baseline.json), [catalog.sql](catalog.sql) and [classified inventory](catalog-inventory.md): the wider dependency, privilege and cross-schema evidence. Fresh capture in this leaf equals the prior decoded catalog in every section; no duplicate snapshot is needed.
- [generate-artifacts.py](generate-artifacts.py): repository-owned read-only capture procedure for an already-created disposable replay. It checks the workspace, seed settings, absence of environment files/remote linkage, project/container/port, migration contents and ledger before capture. It refuses an existing output directory. These checks complement the replay setup; a project-name prefix alone does not establish ownership of an existing stack.
- [generation-result.json](generation-result.json): reviewed execution, repeatability, reconciliation, checks, cleanup and SHA-256 receipt. Raw output, stderr and per-command exits remain in the external receipt directory.

Types and SQL preserve every emitted definition. A deterministic packaging step removes only extra trailing linefeeds so the tracked artifacts pass Git whitespace checks; raw captures remain unchanged outside the repository. No schema/type content is edited or normalized. The existing documentation formatter exclusion is unchanged; ESLint checks the generated TypeScript. Neither artifact is wired into app clients, schemas or builds. No compatibility helper or broad typing refactor is introduced.

The generator's types are not an authorization contract. It omits nine `RETURNS trigger` functions from callable RPC types; the schema/catalog retain them. Its `audit_logs.ip_address` PostgreSQL `inet` column maps to TypeScript `unknown`, which includes null; exact SQL type/nullability remain in the schema/catalog. The other 798 columns' nullability matches the catalog. All 799 column names, four enum value lists and both overloaded Calendar permission RPCs are preserved. No assertion that generated types alone fully describe database constraints is made.

## Reproduce safely

Inspect current lifecycle and seed configuration. Follow the [replay baseline](replay-baseline.md) to create a **new** disposable project with unused ports and disabled seeds. This run substitutes `t3-phase04-01b-02` for `t3-phase04-01a-final`, ports 60520–60527/60529 for 60320–60327/60329, inspector 24583 for 24383, and `old + 4200` for `old + 4000` in setup. Workdir: `/tmp/t3-phase04-01b-02/isolated`. Never reuse this stopped project; change all allocations together for another run.

Use Supabase CLI **2.101.0**, pinned PostgreSQL image **17.6.1.155** (server/pg_dump **17.6**), Node **24.18.0**, npm **11.12.1**, Python **3.14.7** and Docker **29.7.2**. Verify all 156 [input hashes](replay-inputs.sha256). Start using the replay guide's minimal environment; no seed, `.env`, linked project or provider credential is copied. The immutable chain contains 133 versions from `20260413001158` through `20260920000100`.

Run `npm run db:test` **from the isolated workdir**, using the replay guide. Verify the exact ledger, suite results and retained row digests. Then run from the repository root:

```bash
python docs/stabilization/phase-04/generate-artifacts.py /tmp/t3-phase04-01b-02/isolated /tmp/t3-phase04-01b-02/capture-1
python docs/stabilization/phase-04/generate-artifacts.py /tmp/t3-phase04-01b-02/isolated /tmp/t3-phase04-01b-02/capture-2
```

The script executes these installed-tool commands with only PATH/HOME/USER/XDG_RUNTIME_DIR inherited, and stores stdout/stderr separately:

```bash
supabase gen types --local --lang typescript --schema public --workdir /tmp/t3-phase04-01b-02/isolated
supabase db dump --local --schema public --workdir /tmp/t3-phase04-01b-02/isolated
docker exec -i supabase_db_t3-phase04-01b-02 psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/stabilization/phase-04/catalog.sql
```

Require successful exits and byte-identical repeated schema/types/catalog. Repeated raw captures require **no comparison normalization**. The tracked copies remove only extra trailing linefeeds, as shown below. Across other fresh replays, internal FK trigger/TOAST OIDs can change; inspect and reconcile logical identities if that happens, preserving every definition and dependency. Never delete arbitrary numbers, bodies or unknown differences to pass comparison.

Reconcile all public table names and Row columns/nullability, enum values and callable RPC overload counts in the types against the catalog. Reconcile all dump function signatures, including trigger functions, and table names. Types describe 94 non-trigger signatures across 92 names; the remaining nine are trigger functions. Preserve all four commercial tables, eight Organization columns and eight commercial RPCs in this **baseline**. D02's target artifacts must instead reflect the reviewed retirement, generated from both verified fresh and populated-upgrade paths. No current baseline claim substitutes for that future proof.

Copy only successful, reconciled captures with this deterministic packaging step. It changes no SQL/TypeScript definition and leaves raw files intact:

```bash
python - <<'PY_PACKAGE'
from pathlib import Path
source = Path('/tmp/t3-phase04-01b-02/capture-1')
target = Path('docs/stabilization/phase-04')
for name in ['database-baseline.types.ts', 'schema-baseline.sql']:
    (target / name).write_bytes((source / name).read_bytes().rstrip(b'\n') + b'\n')
PY_PACKAGE
```

Keep the unchanged prior catalog and its historical receipt; record fresh equality and hashes. Verify generated TypeScript directly with the installed compiler:

```bash
./node_modules/.bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --types node docs/stabilization/phase-04/database-baseline.types.ts
```

Run all seven canonical repository commands, explicit formatting/link checks for touched Markdown/JSON, and `git diff --check`. This leaf changes no user journey and needs no browser suite. Missing checks are blockers, never inferred passes.

## Cleanup and release boundary

Confirm all 69 public-table/auth-user digests and migration/input hashes remain unchanged after capture. Stop only the project created for this run:

```bash
supabase stop --workdir /tmp/t3-phase04-01b-02/isolated --project-id t3-phase04-01b-02 --no-backup
```

Read back zero owned Docker resources and unchanged pre-existing container identities/states. Keep raw startup logs outside the repo because they can contain disposable credentials. No existing local or remote database is an authorized target.

No schema/runtime change is authored here. Populated upgrade, preflight/recovery, D01 acceptance and every D02 retirement check remain pending their owners. Vercel publication/merge may deploy; repository CI is manual and no automatic remote migration is configured. External deployment settings remain unknown. Publication, merge, deployment and remote cleanup remain separately owner-controlled.
