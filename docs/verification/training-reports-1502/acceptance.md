# Training Reports slice 2 acceptance

Issue [1502](https://github.com/waffleflopper/trooptotask/issues/1502) adds the pure briefing calculation model for parent [1433](https://github.com/waffleflopper/trooptotask/issues/1433), on draft [PR 1511](https://github.com/waffleflopper/trooptotask/pull/1511). It does not replace the current report page or API. Integration, visible forecast/grid/focus/details and redesigned exports remain for slices 1503 and 1504.

`buildTrainingBriefing` returns bottom line, weekly forecast, readiness grid, type risk and up to three focus areas. One private requirement ledger uses the existing Training clock once per Person/Type pairing. A ready requirement lapses on its first expired calendar date. Requirements exempt, not required or optional do not contribute to readiness. Detail matching re-derives selected cells and focus areas from the same input, using Person/Type identities without record IDs.

Bands, ordering, drop alerts, cliff thresholds and focus selection use counts before rounding. A true 9.8-point drop can display as 10 without triggering the 10-point alert. Empty denominators produce `null` readiness and the `none` band. Focus overlap uses the union of already selected requirements. What-if values recover affected requirements against the population denominator, except row chips, which use that row's denominator.

`getTrainingStatus` accepts an optional fourth `asOf` argument, passed to the existing clock. Calls without it retain current behavior. The shared personnel filter accepts MOS/role multi-selections while existing report contracts and scalar callers stay intact. [Retained feature rules](../../domain/retained-feature-rules.md#briefing-calculation-model) record the model contracts and the chosen template denominators.

## Candidate and ownership

Baseline revision `1760b89ce58b40ffe2b505a82da0bf076ec61353`, candidate `655d1dcfd4e46001f0d1283eea5acefe1b31ae9a1d43acd6416f0ed18d6d4db7`. Final source is that revision plus `source.patch` in the validation archive; it includes all nine changed Training source/test files. Final live candidate `8a87a9fa3044b68703a3e75c81a3b2ac61b23109bb5e3f0a14e9106a2a05109d`. Domain prose changed before the final run. Final/validation archives and this record were added after final doctor and cleanup; packaging is not a new live run.

Claude Opus 5.5 medium T3 children, each with focused supplied context and no inherited conversation, performed read-only model/Paper grounding, exclusive implementation and final shared-preview verification/template review. The parent rejected the grounding suggestion to round thresholds because it contradicts exact-count acceptance. The existing clock and prescribed algorithms determined the design; no architecture arena was needed. One writer owned the coupled model; one driver owned each browser run.

A bounded Codex reviewer used the parent model and effort for independent source review. It found no arithmetic mismatch. Its repeated concentration-scan finding was fixed with one Map counting pass. Two fractional ordering/denominator fixtures and frozen-input protection were added. Seven private narration comments were removed, and the misleading expiration fixture name was corrected. Public contract documentation remains. This is independent review, not model diversity or independent execution of the baseline browser run.

## Observed behavior

| Boundary                   | Accepted observation                                                                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                   | Owned native browser showed 25% readiness, then 50% after two dated imports. Alpha/Targeted showed 100%. The real workbook and exact restoration were captured before editing.                                                                                                          |
| Final unchanged reports    | Claude drove normal sign-in, visible Import and reload in T3 shared preview. One Current, Orange, Expired and Missing requirement give 2/4 ready, or 50%. Alpha/Targeted are 100%; Required is 33%.                                                                                     |
| Filter and actual download | Alpha selects Able and 100% across one Soldier. Actual Export returns 200 and a three-Person workbook with saved expiration dates and distinct status labels. It has no completion-date columns. Completion dates are separately verified by the import response and provider readback. |
| Restoration                | Both imported records were removed through editors and Delete confirmations. After reload, rows exactly match the original Current record and reports return to 25%. Hooks restore; final doctor and owned cleanup pass.                                                                |
| Pure model                 | Independent future-date clock parity, literal threshold/tie/filter/empty fixtures, independently renewed what-if rebuilds and valid-empty versus invalid/stale detail scopes pass. Frozen input remains unchanged.                                                                      |

Final app origin was `http://127.0.0.1:44775`; preview reached it through environment-port forwarding at `http://localhost:44775`, worker 1, synthetic A/B Organizations. Node 24.21.0 and npm 11.19.0 were used. Native baseline Chromium was 152.0.7977.82. The final shared-preview browser version was not observable; the launcher's native version does not establish it.

The importer ignores Rank/Expiration Date CSV columns; existing annual rules derived the expected dates. The real button is named Export. The final archive retains screenshots, actual batch/export observations, workbook bytes and exact provider rows. Semantic snapshot JSON and deletion-confirmation screenshots were not preserved in the final shared-preview run. The recorded confirmations and restoration are not described as those screenshots.

Policies, authorization/failure/full-map journeys and the future report UI were not re-executed for this pure-model slice. [Slice 1 acceptance](../training-reports-1501/acceptance.md) retains its own scope and unchanged SQL evidence. Claude noted existing matrix whitespace, a red headline/ring and active-filter wording. Those details were not changed here. Issue templates are normative where Paper copy differs; no new wording choice is left open in 1502.

## Verification and review

`npm run format`, `npm run gate` and `npm run build` pass. All 661 test files / 6,456 tests pass; type checking reports zero errors and warnings. Focused checks pass at the model/status/filter/clock and retained server-query boundaries. Touched Markdown, links and whitespace receive separate documentation checks.

Accepted logs retain three existing Map/Set lint warnings, 418 historical governance findings with the regression gate passing, a chunk-size warning and an optional `@opentelemetry/api` resolution warning. No gate, assertion, scan, suppression or budget was weakened. No new database/provider/API boundary changed, so slice 1's unchanged migration replay evidence was not repeated. Remote production was neither accessed nor modified.

The parent measured the concentration fix offline through a reproducible Vite middleware probe. The unusual 2,048-person / 20-type fixture with distinct duty roles improved from 411.16 ms to 40.37 ms median, using two warm-ups and five samples. The before case is an in-memory projection of the old loop, not a committed release revision. Full distributions, hashes, fixture generation and environment are preserved. Typical grouped and larger grouped probes stayed roughly equal. No production network latency or timing budget is claimed.

Deslop was unavailable. The parent inspected abstractions, dead paths, casts, suppressions, consumers and unrelated edits directly. Claude's visual/template verdict is clean for this slice. Its two task-reference trail flags were addressed by preserving the actual delegated results. Benchmark timings are parent measurements; Claude did not rerun them. The writer's unsupported fault-injection claim is not acceptance evidence. Independent expanded-artifact acceptance is clean. The reviewer matched every source patch block to the checkout, re-hashed the expanded payloads and inspected actual workbook bytes, numeric screenshots, import responses and restored rows. Validation packaging preserves those reviewed bytes and the verdict; fresh extraction and every payload hash pass afterward.

## Decisions

Model the Domain chose one requirement ledger and a typed five-section result. Laziness Protocol reused the Training clock and personnel filter without a new service or request waterfall. Boundary Discipline keeps trusted domain calculation pure; network parsing belongs to the later integration slice. Test Behavior, Not Implementation protects literal arithmetic outcomes and independent renewal/rebuild results. Prove It Works inspects actual downloads and persisted restoration.

Sequence Work into Verifiable Units keeps this slice independently checked on the shared draft PR. Separate Before Serializing Shared State gives exclusive writer/browser ownership. Guard the Context Window supplies bounded prompts without conversation inheritance. Build the Lever preserves reproducible packaging and benchmark scripts. The validation decision trail uses append-only entry timestamps, not reconstructed action times.

## Durable artifacts

Captures were checked for credentials and token-bearing URLs; no redactions were required. Each archive has `inventory.json` with original relative payload paths and expanded SHA-256 values. Fresh extraction verifies the exact file set and every payload hash.

| Archive                                                    | Payloads | SHA-256                                                            |
| ---------------------------------------------------------- | -------: | ------------------------------------------------------------------ |
| [Baseline](baseline.tar.gz)                                |       56 | `3f5eed79100b3747453564f95b366eaf66e3c48c7ab1fd72384ddce456c3da2f` |
| [Final shared-preview proof](final.tar.gz)                 |       25 | `7587454d049dcd8397598fb5537d36410df82e2689524cd1d0d4dd5f43f12626` |
| [Validation and independent acceptance](validation.tar.gz) |       28 | `ccc30126735e7e9801314261127e293ae7b336aef96473a4270a9825b13e0df2` |

Extract a chosen archive with `tar -xzf ARCHIVE -C EMPTY_DIRECTORY`. Compare the archive SHA-256 with this table, then the expanded payload file set and every hash with `inventory.json`. Start with `observations.md` in baseline/final and `results.md`, `runtime.txt`, `source.patch`, the task/review receipts, `decisions.tsv`, accepted gate/build logs and benchmark scripts/logs in validation.

## Release obligations

Apply slice 1's `20261004000100_training_readiness_goal.sql` through the authorized release process before deploying code that selects the new column. It remains unapplied remotely by this task. Keep PR 1511 draft while issues 1503 and 1504 complete parent 1433. Parent completion, merge and deployment are not claimed.
