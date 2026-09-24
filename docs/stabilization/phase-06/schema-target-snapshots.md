# Phase 06 D02 generated target schema

[schema-target-snapshots.tar.gz](schema-target-snapshots.tar.gz) contains the complete generated `public` TypeScript types, schema-only SQL dump and effective catalog for the local D02 target. These are review evidence, not application imports or executable migrations. The single transactional forward migration remains the replay authority. The archive SHA-256 is `0914a9cd32040b3fa6c0d40d4545a6b855f8338bb511cf0e7c3ad40cb58c9d36`; individual member hashes are in [schema-target-snapshots.sha256](schema-target-snapshots.sha256).

The inputs and raw command logs are under `/tmp/t3-phase06-d02-atomic-v3-20260923/`. Fresh and populated-upgrade projects used distinct seed-disabled disposable workdirs and replayed the exact 138-version target ledger. `supabase gen types --local --lang typescript --schema public` and `supabase db dump --local --schema public` produced byte-identical fresh and upgrade output. The existing [catalog query](../phase-04/catalog.sql) produced an identical complete JSON object from both targets across every section, including function bodies, privileges, dependencies, triggers and migration versions. No Duty Roster or DA6 identity/body remains in that target catalog. The [final review-repair record](../EVIDENCE.md#pr-1333-review-repair--atomic-d02-cutover) gives the setup, rollback, preserved-data and test results.

| Archived member            |     Bytes | SHA-256                                                            |
| -------------------------- | --------: | ------------------------------------------------------------------ |
| `catalog-target.json`      | 1,389,636 | `217504459a3c29ca5f9cb00d371673b49b2ebcdb67c9c97222f407a7e4051e93` |
| `database-target.types.ts` |    94,006 | `db1355cef9309f48c7f3a78fe8588e716e86eb48d6c57215f2c97251b9e9f409` |
| `schema-target.sql`        |   268,860 | `0e57906e02cc0f068657cf53c3e8408d48990c839c5377d4823e13e74fb3133f` |

Extract outside the checkout and verify all three members before review:

```bash
phase06_evidence="$(pwd)/docs/stabilization/phase-06"
phase06_snapshots="$(mktemp -d /tmp/t3-phase06-snapshots.XXXXXX)"
printf '%s  %s\n' \
  '0914a9cd32040b3fa6c0d40d4545a6b855f8338bb511cf0e7c3ad40cb58c9d36' \
  "$phase06_evidence/schema-target-snapshots.tar.gz" | sha256sum --check
tar -xzf "$phase06_evidence/schema-target-snapshots.tar.gz" -C "$phase06_snapshots"
(cd "$phase06_snapshots" && sha256sum --check "$phase06_evidence/schema-target-snapshots.sha256")
```

The generated types passed ESLint via `--stdin-filename docs/stabilization/phase-06/database-target.types.ts` and standalone strict TypeScript compilation with the repository's installed toolchain. The archive uses sorted regular members, zero timestamps, fixed ownership and gzip's zero timestamp. It does not replace the historical [Phase 04 archive](../phase-04/schema-snapshots.md) or the [D01 pre-retirement catalog](replay-catalog.md).
