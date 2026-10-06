# Training matrix Excel export acceptance

The main Training page now exports an Excel workbook with one Person per row and every Training type as a column. It respects authorized roster and Group selection, including columns hidden by a saved view. What's New leads with Training Reports forecasting and renewal planning, then announces matrix export. The affected verification recipe and feature-map index now cover the action. This is scoped upkeep, not a full-map audit.

## Accepted behavior

| Record or type                               | Export cell or header                                           |
| -------------------------------------------- | --------------------------------------------------------------- |
| Ordinary dated completion, including expired | Saved completion date as `YYYY-MM-DD`                           |
| Exempt Person                                | `exempt`, before any saved date                                 |
| Valid completion without a date              | `completed (no date)`                                           |
| Required without completion                  | `missing`                                                       |
| Not required without completion              | `not required`                                                  |
| Not required with a saved date               | Saved date                                                      |
| Expiration-only type                         | Saved expiration date; `(expiration only)` header               |
| Never-expiring type                          | Saved completion date when supplied; `(completion only)` header |

The workbook adds Name, Rank and Group, alphabetical Person rows, and catalog column order. Export captures the selected rows at click time and reuses loaded data. It makes no additional data request. First use may fetch the lazy ExcelJS chunk. Duplicate activation is disabled, and a workbook failure exposes explicit Retry. A pending download is cancelled when the component, Organization, read authority or authorized roster no longer supports it. The latter is a small local guard, not a new authorization mechanism.

## Candidate and observations

Base revision is `228e6d5c8b0c9c3b38f922fb1a4b7c50e71eac4a`. The exact seven-file tested patch is inside the validation archive as `candidate.patch`, SHA-256 `8e86307baa5fd5fb1c864f22eba24c6a59956a3032b8a12e954f6295d8baf47c`.

Baseline candidate `63619109f005dad68641342e282eacbdc7f2394dfd9c54e15dd7b0a9d259c2da` ran at `http://127.0.0.1:35829`. The unchanged matrix and Reports briefing passed. Reports retained 25% readiness and its five-sheet Excel export after reload.

Final candidate `704bbbacfec50c0eb02dd12e17bcc185e29c486d0b0c47bf10410d367741137c` ran at `http://127.0.0.1:43723`. Native actions proved view-only export, all columns despite Focus View, Alpha Group filtering and filter persistence after reload, Alpha-only authorized export, and disabled export for an empty roster. Four actual matrix downloads matched literal fixture expectations. Reports retained its 25% briefing and five-sheet download. The visible What's New modal put forecasting first. Doctor and owned cleanup passed, and captures survived teardown.

Both runs used synthetic accounts and an owned disposable provider through [verify-trooptotask](../../../.agents/skills/verify-trooptotask/SKILL.md). No existing development or production database was used. Node 24.21.0, npm 11.19.0 and Chromium 152.0.7977.82 were used. Archive run notes identify the roles, actions and expected cells. Later additions contain evidence and this record; they do not represent a new live candidate.

## Checks and limits

All required commands passed on the tested source patch.

- `npm run format`, `npm run format:check`, `npm run lint`, and `npm run governance:check`.
- `npm run check` with zero errors and warnings.
- `npm run test` with 710 files and 7,134 tests passing.
- `npm run build`.

Actual serialized XLSX and rendered component tests cover special dates and states, failure with Retry, duplicate activation, loading and pending-download lifetime. Those variants were not newly driven live. Foreign-actor export, empty catalog, offline lazy-module recovery, mobile overflow and bulk-scale timing also remain outside this live run. No database boundary changed, so isolated SQL gates were not applicable.

The validation archive preserves exact commands, non-secret synthetic environment overrides and logs. Node 26 failed the first baseline build; Node 24 resolved that prerequisite. An initial full-check attempt found test type errors, exhausted the shared `/tmp` quota and used an incorrect test origin. Corrected types, a task-owned temporary directory and blank test origins resolved those failures in the final full sequence. Lint retains three warnings in untouched Calendar and Onboarding code. Build retains unrelated dynamic-import, large-chunk and optional OpenTelemetry dependency warnings. The test's invalid-revision diagnostic is intentional fixture coverage.

An isolated reviewer accepted the complete source diff, direct and reverse consumers, coverage selection, actual expanded workbooks, snapshots and screenshots. The review found one same-Organization access-narrowing issue; the local guard and held real-workbook regression resolved it. No source or artifact blockers remain. This is independent artifact review using the same configured model, not independent live execution or model diversity.

## Durable evidence

Captures were inspected for credentials and token-bearing URLs. None were found; no outcome-changing redactions were made. Each archive includes an inventory of original relative filenames and SHA-256 hashes of sanitized expanded payload bytes.

| Archive                         | SHA-256                                                            | Payload files |
| ------------------------------- | ------------------------------------------------------------------ | ------------- |
| [Baseline](baseline.tar.gz)     | `3ef4279fae780e1ecdfc5a98b6249fa03ef154078cb19d2c4146290de13592cc` | 6             |
| [Final](final.tar.gz)           | `89450fa7a6b661cd7beb8e4b9e2df8cfd270f597c6a8e667995011f34ea11b52` | 24            |
| [Validation](validation.tar.gz) | `5dbef41fc2364044faa1a053bb62c5fb2a45eb3db5763de39f441646d37579ac` | 21            |

To inspect the evidence, extract all three archives into the same fresh ignored directory. Compare each archive hash with the table. For each `*-inventory.json`, compare the complete payload filename set and each expanded file hash with its entries. The inventory itself is excluded from its payload list and protected by the archive hash. The parent re-extracted all three and passed these checks before acceptance. The independent reviewer also passed in-memory archive hashes, exact file sets, payload hashes and byte comparisons with the observed captures. `verify-workbooks.mjs` uses ExcelJS from the project installation and literal fixture expectations to check the expanded downloads.

## Choices that kept the change focused

- Laziness Protocol drove reuse of the toolbar, lazy workbook writer and loaded data.
- Model the Domain drove the typed snapshot, indexed records and explicit export state.
- Test Behavior, Not Implementation drove literal cells checked after XLSX serialization and actual UI actions.
- Prove It Works drove native downloads and inspection of their contents.
- Build the Lever drove rerunnable workbook and archive verification scripts.
- Sequence Work into Verifiable Units drove distinct unchanged baseline and final observations.

The direct deslop fallback found no unnecessary layers, unrelated source changes or added suppressions. Independent comment review found zero deletions needed and no open constraint comments. One cohesive local commit is the handoff. Publication and deployment remain outside this request.
