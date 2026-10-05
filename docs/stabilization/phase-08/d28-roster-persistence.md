# D28 ordinary Sign-in Roster persistence

This intermediate deliverable references [#1376](https://github.com/waffleflopper/trooptotask/issues/1376). It starts from merged [#1535](https://github.com/waffleflopper/trooptotask/pull/1535), `a4f5e2abef96f4ab732ba8c023abd5759416be3c`, on `stabilization/1376-roster-persistence`.

## Declared outcome and issue remainder

Ordinary roster list, lookup, creation, signed-file metadata and deletion use a fixed owner adapter. Its five-operation port returns the existing camel-case roster DTO. The create command names each supported field; currently unvalidated date/flag inputs remain explicit `unknown` values. Tenant and whole-Group predicates apply before pagination and count. An empty Group grant returns no rows without a provider read. Current title/date filters, ordering, errors, snapshots and file compensation remain.

The same deliverable migrates both reverse consumers. Settings injects an ordinary roster rank reader into Personnel reference summaries and deletion checks. The owner parses stored JSON into eligible rank strings; Personnel retains whitespace/case matching and counts each roster once per reference family. Organization JSON/Excel backups use a separate ordinary fixed-table reader that retains every historical field and traverses all provider pages. Personnel gains no dependency on the roster owner. Replaced constructors, foreign-table parsing and unused generic array-scope/options support are deleted with their callers.

This complete owner seam is an independent reviewable result. Other generic persistence owners and shared provider infrastructure remain under D28; combining them would mix separate domain contracts and verification selections. D28 is incomplete. D29 mixed utilities and D30 remain blocked. This PR uses `Refs #1376`.

No migration, schema, RLS, bucket, service-authority or UI change is proposed. Existing unchecked create inputs and error-only ordinary delete acknowledgment are preserved. Concurrent export pages do not provide snapshot isolation. Accepted Storage response/compensation and client-lifecycle evidence applies only to unchanged boundaries, not the new queries.

## Throughput and decisions

The root owns request/route composition, shared controls, evidence and one native worker. One implementation worker owns isolated roster files, and one read-only reviewer assesses source and expanded artifacts. Finish and format executable inputs before freezing the production candidate. Use focused local tests and current-head CI for the complete validation sequence. One list query carries filtering, range and exact count. Reverse readers select only their needed projection or intentional raw archive and reuse bounded page traversal. No speed or memory improvement is measured.

Model the Domain selects a fixed command and consumed DTO instead of arbitrary table/column maps. Migrate Callers Then Delete Legacy APIs groups CRUD, rank and export consumers in one cutover. Subtract Before You Add removes unused generic roster scope/options support. Test Behavior, Not Implementation keeps literal DTO/reference/deletion expectations and real SDK transports. Prove It Works requires actual downloaded PDFs/workbooks and native saved-state reads.

## Baseline proof

Both runs use disposable repository `verify:app` services and documented native controls. Node 24.21.0, npm 11.19.0 and Chromium 152.0.7977.82 are recorded in their inventories. Initial/final doctor and owned cleanup pass. No remote or existing local database is used.

The unchanged application at digest `58c26c90066c685ff5d9c0ef57d470bdfa3755cdc8204705bf1ecebae85efd5b` completes native roster creation/PDF, hard reload, scoped list, upload/reload, removal and confirmed deletion. Actual owner JSON and Excel downloads retain the created row. Separate authenticated HTTP proves scoped offset/count and a viewer replacement 403; exact row/file readbacks prove invariance. The PDF has 4,153 bytes and SHA-256 `9ff39b1ef1f392d469a045d8cb04b5c3a89c087724295a619b4d4e1f3a3bc1af`. No post-deletion reload or native Personnel edit is claimed.

The unchanged application plus the journaled `roster-pages` fixture at digest `8f0b2ee5a5e4810c7b6e7e735fbb1a545e61c4358544c64a3b18e60f98e0d215` exports all 1,004 records through native JSON and Excel. The rerunnable comparison checks every field, null, microsecond timestamp and extra nested value against source rows. Settings shows 2,002 historical custom-rank references and offers Retire without Delete. After exact cohort cleanup, original rows remain identical and native reload shows zero custom-rank references. Privileged setup and direct readback remain distinct from native interaction.

| Run                                                         | Payloads | Archive SHA-256                                                    |
| ----------------------------------------------------------- | -------: | ------------------------------------------------------------------ |
| [Ordinary baseline](d28-roster-baseline.tar.gz)             |       86 | `ada914b58e42a195118254ae63eb70853949b7d2caab9bb091a159e5531ad5c3` |
| [Provider-sized baseline](d28-roster-large-baseline.tar.gz) |       44 | `8185292a276c07c9a38a37d12df18357885f6198b393a86885a2848b40282010` |

Extract each package into a separate scratch directory with `tar -xzf ARCHIVE -C DIRECTORY`. `INVENTORY.json` lists every expanded payload and SHA-256, excluding itself. Fresh extraction verifies exact membership and hashes. Run `python3 compare-downloads.py` in the large package. No credential/JWT/token-URL pattern is found in the captured text. `RUN.md` retains corrected helper/sheet attempts and limits without granting failed calls success credit. Packaging integrity is separate from independent behavioral acceptance.

## Candidate verification and acceptance

The frozen candidate at `b95d424d9a13d397868e715033f5c4d1884d7d13ffd720724891ecd32f4b380b` completes native historical reprint, new roster/PDF, hard reload and Alpha scope. A controlled browser upload 503 shows an error and stores no object. Restoring the control and explicitly retrying saves the scan; another reload preserves it. Native Open downloads the same 4,150 bytes and SHA-256 `8f87e6a45cf135450a45ac1b28713e84705c83b5b41dee8117249c23fda761e9`. Native removal persists after reload. Reupload followed by confirmed file-bearing deletion removes both row and object and remains absent after reload. A separate ordinary viewer replacement returns 403 with exact row/file invariance.

Native owner JSON and Excel again retain all 1,004 rows and every source value. The raw workbook and JSON are compared independently with provider readback. Settings counts all 2,002 historical custom-rank references and offers Retire without Delete. Exact seed cleanup preserves the original three rows; native reload returns the custom rank to zero references. Final doctor and owned cleanup pass. No native Personnel edit, multi-Person ordering effect, full foreign browser journey, list failure/retry or new SQL is claimed. Existing retained evidence and focused tests cover unchanged contracts within their recorded limits.

[Final candidate archive](d28-roster-final.tar.gz) preserves 178 payloads, including one PNG, three PDFs, an actual workbook, frozen source inputs, check/review logs and rerunnable comparison scripts. Its SHA-256 is `0bee05a4605e397512abf445460d573c9de85b5cc7fc47b54d70ae3204f7b0c4`. Fresh extraction verifies exact membership and every expanded hash. Run `python3 compare-downloads.py` and `python3 compare-effects.py` after extraction. One signed-URL token is redacted; download and image bytes remain intact. The first display-redaction attempt is corrected in the packaged capture. All three packages retain 308 payloads.

The first final launch fails at disposable provider creation. Its diagnostic suppresses credential-bearing output and provides no cause. Owned cleanup passes, and a fresh same-source launch succeeds. The original cause remains unresolved without causal repair credit. No application journey ran in the failed launch.

Final focused checks pass 13 suites / 258 tests and four route/domain suites / 73 tests, with the rank suite overlapping. Types have zero errors and warnings. Format, ESLint, local Markdown links/anchors and governance pass, with three unchanged lint warnings and 160 existing findings. A deliberate lost-Group-containment fault produces two failures at literal row/count expectations before exact source restoration. Early missing-constructor type and missing-parenthesis governance failures are corrected and retained in the record. All successful launches use the production build; current-head CI must still supply the complete sequence before merge.

Complete independent acceptance reports Standards GO and Spec GO for all 36 paths, including 33 text files and three archives. It inspects all 308 expanded payloads, all four PDFs, three screenshots and three workbooks; independent workbook decoding matches every raw field against JSON/provider readbacks. All 29 frozen source/test/helper/recipe files match this candidate. Source, direct/reverse consumers, removals, grouping and coverage selection pass without consequential findings. This is independent source/artifact review, not independent live execution. Comment review finds no deletion candidate or new suppression; the raw export reader comment defines its public API contract.

CodeRabbit source and updated-record reviews both complete all 33 text paths against `a4f5e2ab` with zero findings and exit 0. The archives receive separate expanded-artifact acceptance. Later acceptance-result prose does not change the frozen executable inputs and receives documentation validation. The installed package lacks deslop, so the cleanup fallback checks the final diff, dead APIs/options, comments, suppressions, types, meaningful tests and scope directly. Full exact-head CI/build and completed clean hosted review remain merge gates.

## Release and remaining obligations

No database operation is required for this deliverable. Hosted migration parity remains unverified, including D25's owner obligation. This local proof grants no deployment or production-parity claim. Finish other generic persistence consumers/removals and final integrated D28 acceptance before issue closure or dependent work.
