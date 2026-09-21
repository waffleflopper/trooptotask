# Archived schema evidence

[schema-snapshots.tar.gz](schema-snapshots.tar.gz) preserves the six generated Phase 04 snapshots byte-for-byte. These are database review evidence, not application imports or executable migrations. Archiving removes 122,305 lines of duplicate and historical schema from ordinary source searches while keeping the complete definitions, dependencies and generated types available for inspection.

The archive contains 4,693,602 uncompressed bytes in 324,307 compressed bytes. Its SHA-256 is `23159ee02c2e990e820eb1b1cfd69025e714f81fd19a6e6e9c572609d2980c4b`. Each member retains its original filename and hash in [schema-snapshots.sha256](schema-snapshots.sha256). Those hashes match the existing [catalog](catalog-result.json), [baseline generation](generation-result.json) and [retirement](retirement-result.json) receipts; no receipt or snapshot content was rewritten.

## Archived files

| Member                       |  Lines | Purpose                                                             |
| ---------------------------- | -----: | ------------------------------------------------------------------- |
| `catalog-baseline.json`      | 49,134 | Complete pre-retirement catalog, definitions, ACLs and dependencies |
| `catalog-target.json`        | 46,952 | Verified post-retirement catalog from fresh and upgrade targets     |
| `database-baseline.types.ts` |  4,616 | Generated pre-retirement public types                               |
| `database-target.types.ts`   |  4,287 | Generated post-retirement public types                              |
| `schema-baseline.sql`        |  9,090 | Pre-retirement schema-only dump                                     |
| `schema-target.sql`          |  8,226 | Post-retirement schema-only dump                                    |

The baseline bytes are identical to merged D01 at `584af3797dae92c42968d69ab8e6ad279f955836`; target bytes are identical to reviewed D02 implementation `1e24c9e90e8baf984e5636e2130411e0bc14a4f6`. Git history still retains the earlier plain files. Historical receipt paths describe those original runs; resolve archived member names through this guide when reviewing the current checkout.

## Extract and verify

Run from the repository root. Extract outside the checkout so generated definitions stay out of normal source searches. The archive has only the six regular files above, with no subdirectories or links.

```bash
phase04_evidence="$(pwd)/docs/stabilization/phase-04"
phase04_snapshots="$(mktemp -d /tmp/t3-phase04-snapshots.XXXXXX)"
printf '%s  %s\n' \
  '23159ee02c2e990e820eb1b1cfd69025e714f81fd19a6e6e9c572609d2980c4b' \
  "$phase04_evidence/schema-snapshots.tar.gz" | sha256sum --check
tar -xzf "$phase04_evidence/schema-snapshots.tar.gz" -C "$phase04_snapshots"
(cd "$phase04_snapshots" && sha256sum --check "$phase04_evidence/schema-snapshots.sha256")
```

Require all six hash checks to pass before inspecting or comparing the extracted files. Use explicit paths under `$phase04_snapshots` for catalog searches and schema/type diffs. Never apply either SQL snapshot to a database; the append-only migrations remain the execution authority. Extraction and hash checking need no database connection.

To inspect one file without extracting the archive:

```bash
tar -xOzf docs/stabilization/phase-04/schema-snapshots.tar.gz catalog-target.json | less
```

## Reproduction and verification coverage

The [baseline generation procedure](generation-baseline.md) and [fresh/upgrade target procedure](retirement-verification.md#real-artifact-generation) remain the source of truth for producing new captures. Compare generated output with the extracted evidence, accounting only for the documented original packaging normalization and reviewed replay-specific identifiers. Do not replace historical members or update hashes merely to make a new run agree.

Both generated TypeScript files previously participated in repository linting and standalone compilation. Preserve those checks explicitly when reviewing extracted or newly generated snapshots; no ignore rule, assertion or database verification input changes with this archive. After extraction, run from the repository root with installed dependencies:

```bash
for phase04_types in database-baseline.types.ts database-target.types.ts; do
  ./node_modules/.bin/eslint --stdin \
    --stdin-filename "docs/stabilization/phase-04/$phase04_types" < "$phase04_snapshots/$phase04_types"
  ./node_modules/.bin/tsc --noEmit --strict --target ES2022 \
    --module NodeNext --moduleResolution NodeNext --types node \
    --typeRoots "$PWD/node_modules/@types" "$phase04_snapshots/$phase04_types"
done
```

The archive uses sorted member names, fixed zero timestamps, empty owner/group names and regular-file mode 0644, with a zero-timestamp gzip header. Its contents and the existing receipts, rather than compressed size or archive timestamps, establish evidence continuity.
