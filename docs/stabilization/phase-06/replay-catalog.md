# Phase 06 pre-retirement replay and raw catalog

This is the executable-schema baseline for [D01 #1328](https://github.com/waffleflopper/trooptotask/issues/1328), leaf 06-01a. It is a fresh local replay before any Duty Roster retirement migration. The [compressed catalog](catalog-baseline.json.gz) is a complete capture from the existing read-only [catalog query](../phase-04/catalog.sql), including public definitions, policies, grants, dependencies, nonpublic SQL/PLpgSQL bodies, cron jobs and the migration ledger. The [input manifest](replay-inputs.sha256) fixes the 137 migrations, 22 SQL suites, two templates, source configuration and package script used for this capture. Later leaves classify candidates and build the populated Calendar fixture; this empty replay does not establish upgrade preservation.

## Reproduce in a new disposable project

Follow the setup and cleanup procedure in the [Phase 04 replay guide](../phase-04/replay-baseline.md) with these exact substitutions. Allocate a new project, directory and unused ports for each new run; never reuse the recorded stopped project. The guide's refusal checks for existing workspaces, Docker resources and IPv4/IPv6 ports still apply.

| Phase 04 guide value                 | This recorded run                                                     |
| ------------------------------------ | --------------------------------------------------------------------- |
| Input manifest                       | docs/stabilization/phase-06/replay-inputs.sha256; 163 files           |
| Receipt/workdir                      | /tmp/t3-phase06-01a-20260922/isolated                                 |
| Project ID                           | t3-phase06-01a-20260922                                               |
| Service ports                        | 60620–60627 and 60629; replace each source 5632x port with old + 4300 |
| Inspector port                       | 24683                                                                 |
| Pinned PostgreSQL image              | 17.6.1.155                                                            |
| Seed setting in copied configuration | enabled = false, sql_paths = []                                       |

Copy only package.json and the source supabase configuration, migrations, tests and templates into that new workspace. Do not copy the legacy seed, environment files or remote linkage. Check every source hash with:

    sha256sum --check --status docs/stabilization/phase-06/replay-inputs.sha256

The copied configuration is intentionally changed only for project ID, ports and disabled seed paths; compare all other copied file hashes to the manifest. Start Supabase with --workdir pointing at the new isolated workspace. Run npm run db:test **from that workspace**, so every supabase test db command resolves its disposable configuration. Use only PATH, HOME, USER and XDG_RUNTIME_DIR from the environment. No npm install or repository database command is needed.

After the SQL suites pass, use the new project's own database container and the read-only query:

    docker exec -i supabase_db_t3-phase06-01a-20260922 psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/stabilization/phase-04/catalog.sql > /tmp/t3-phase06-01a-20260922/catalog-lines.jsonl

The query returns two JSON lines: all catalog sections, then environment/ledger metadata. Require migration versions to equal the sorted 137 source filenames from 20260413001158 through 20260922000300. Repeat the query on the same replay and require decoded JSON equality. The checked-in gzip contains those two objects merged as one sorted, compact JSON object plus a final newline; gzip has no filename or timestamp. Decode it with:

    python -c "import gzip,json; from pathlib import Path; print(sorted(json.loads(gzip.decompress(Path('docs/stabilization/phase-06/catalog-baseline.json.gz').read_bytes()))))"

Catalog-generated internal FK trigger names and TOAST identifiers can differ across fresh projects. Compare their logical relationships and complete definitions, not raw cross-project bytes. The active-object classification remains 06-01b; a raw capture alone never authorizes a destructive drop.

Stop only the project just created with supabase stop --workdir, its exact --project-id and --no-backup, as in the Phase 04 guide. Check its owned Docker resources are gone and pre-existing containers remain in their original state. No remote or existing local database is part of this procedure.

The [execution evidence](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/EVIDENCE.md#task-06-01a--immutable-replay-and-raw-effective-catalog) records the observed results and hashes. This capture does not claim production schema parity.
