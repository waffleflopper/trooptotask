# Owned Calendar persistence

Refs #1376. The current deliverable moves Calendar catalogs, availability and assignment reads to their three selected owned interfaces, migrates direct and reverse callers together, and removes the five replaced entity implementations. Source integration and native execution are complete in [#1556](https://github.com/waffleflopper/trooptotask/pull/1556). Independent final artifact acceptance reports Standards GO and Spec GO. Exact-head CI and completed clean hosted review remain pending. This record grants no merge or whole-D28 completion credit.

The merged [atomic removal prerequisite](d28-calendar-atomic-bulk-removal.md#integrated-acceptance) remains the single bulk-delete implementation. The full availability provider composes that narrow remover; DELETE keeps its separately admitted narrow context. No additional migration is planned. Personnel/Groups, Training, Onboarding, residual settings and final generic facade removal keep #1376 open. D29/D30 stay out of scope.

## Accepted unchanged-main baseline

Fresh round 2 runs on main `2024a521d93716cfca452c9c0f919923883d0db5`, tree `74d6d0fab41d05d3ef553384b537ca80a3629ce7`, candidate `97e90a3a666c663031cc720d5358fb86ec5dd4873bd6eb1119e8e659a73ddf5f`. Its owned worker 1 session is `e7aea237-a98c-4bee-b027-a5a195d3c2d3`, origin `http://127.0.0.1:37063`, build digest `c707a65be8371ad729365e21db56880967580ce6c4291354b05d776ba2827a34`. Node 24.21.0, npm 11.19.0 and Chromium 152.0.7977.82 are captured before driving.

All 116 selected cases are accounted for, with 114 PASS, two ISSUE and zero UNRUN. Settings/catalogs, single and bulk availability, Planner, Reports, Personnel and Organization exports, Dashboard, response lifetime and terminal cleanup are observed. All five Reports workbooks and the permitted Personnel histories contain independently checked cells. The real native 500-ID removal deletes exactly its submitted IDs after Back and a failed attempt both preserve rows. Dashboard uses isolated real availability and assignment holds and marked source failures. Cross-Organization pending reads and persisted saves retain the current Organization facts and quiet retired feedback.

Robert accepts two rare edges as non-blocking. [#1554](https://github.com/waffleflopper/trooptotask/issues/1554) records missing or foreign catalog references returning generic HTTP 500 without row changes. [#1555](https://github.com/waffleflopper/trooptotask/issues/1555) records the 501-Person Group-scoped range failing with URI Too Long. Both stay ISSUE. Their likelihood ratings are qualitative Very low, with rationale, rather than measured probabilities. Normal supported-workflow and verification blockers remain repair work. Neither deferred issue is an implementation dependency for this cutover.

Independent Claude Opus 5.5 artifact review reports Standards GO and Spec GO for this baseline with the two exceptions. It recomputes the complete inventory, holiday dates, terminal effects, exports and selected UI/source observations. This is artifact acceptance, not independent live execution or final-candidate proof.

The original 76 A/B business and membership sets contain 153 rows. Before terminal deletion, all original rows remain exact. The final phase intentionally consumes five original synthetic rows through retiring Status, retiring Assignment and federal reset. No same-ID restoration is manufactured. The remaining 148 originals and memberships remain exact; 44 newly generated federal rows, audits, notifications and export history are declared additive effects. The final full-row capture precedes final clean-seeds; its empty journal is retained, but no complete row equality after that last cleanup is inferred.

Final doctor passes. Root independently checks all 33 recorded processes absent, ten owned ports refusing connections, and worker and short TMPDIR absence. Frozen source, dependency and external-input sets match before and after. Other local databases and protected private worktrees remain untouched.

## Durable baseline evidence

The [baseline archive](d28-calendar-main-baseline-2024a521-r2.tar.gz) retains every original raw payload byte, the worker report and receipt, independent acceptance, root checks and packaging notes. It contains 5337 payloads, including 5331 raw files, 47 PNGs and 13 actual download artifacts. Archive SHA-256 is `3d646d4eea20ed1731d38ff859f602fede668bf3a1398395f519509f653ce487`. Fresh root extraction verifies the complete expanded file set, bytes and hashes. Packaging is performed after closure and does not constitute a fresh live run.

Inside, `packaging-notes.md` adds specific references for 33 cases whose phase-level ledger wording was insufficient. The original ledger and statuses remain unchanged. The declared derived Python bytecode file remains as reader provenance, with no behavioral credit. One mistaken 404 output is a declared sanitized projection. Missing catalog response bodies, six zero-byte attachment captures, feedback deduplication without event timestamps and journal ordering limits remain in `worker-report.md`. Actual downloaded files supply export-content proof separately.

Extract into a fresh ignored directory and verify its inventory. The archive hash also protects that inventory.

```bash
proof_dir=$(mktemp -d .verification/calendar-baseline.XXXXXX)
tar -xzf docs/stabilization/phase-08/d28-calendar-main-baseline-2024a521-r2.tar.gz -C "$proof_dir"
python3 - "$proof_dir" <<'PY_VERIFY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
entries = json.loads((root / 'inventory.json').read_text())['files']
assert {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()} == {e['path'] for e in entries} | {'inventory.json'}
for entry in entries:
    data = (root / entry['path']).read_bytes()
    assert len(data) == entry['bytes']
    assert hashlib.sha256(data).hexdigest() == entry['sha256']
print(f'Verified {len(entries)} payloads')
PY_VERIFY
```

The failed first launch remains separately recorded in private recovery receipts. Its overlong TMPDIR prevents a healthy browser; all 116 cases are UNRUN there, with no product-failure or application-acceptance credit. Round 2 uses a fresh short TMPDIR and owned session. The older private Calendar failure and its unrun phases remain attached to that older candidate; the new current-main observations do not relabel them.

## Source integration checks

The initial source cutover changes 79 source/manifest paths. Review follow-up also removes the now-unused Calendar assignee filter; the typed assignment reader owns its replacement. Focused verification passes 44 suites and 287 tests, type checking with zero errors or warnings, governance with 157 retained findings and no regressions, and changed-source formatting and lint. The installed-SDK full-factory test detects deliberately wrong Organization binding and a legacy DELETE-URL substitution; both expected failures are retained in private receipts, the factory is restored byte-for-byte, and its complete 11-case suite passes. Independent comment/suppression review finds no actionable flags. Complete independent source and baseline-packaging acceptance at `eb806f2a` reports Standards GO and Spec GO with no consequential findings; the unused helper is its narrow cleanup follow-up. CodeRabbit reviews all 88 changed text paths with zero findings and explicitly excludes the archive, which independent expanded acceptance covers. These checks do not establish final native or release acceptance.

## Final native proof and review repair

The final production run is frozen at `0fd05c9e4f32035e0b9f960ac42c64a31c47fcb4`, tree `edb4c4e7b5f7892f7ae56742a007c6000f882ba0`, candidate `be5c4b92df5e309f6ca5e4f96eb7a43b4988b0a4b2366f2cebf729762eff2d4e`. One worker 1 session, `1ee592ea-0a9c-494a-b901-ebf48b6fafa3`, uses origin `http://127.0.0.1:40621`. Node 24.21.0, npm 11.19.0 and Chromium 152.0.7977.82 are recorded. The declared npm 11.12.1 differs. All source, dependency, external and executable bindings remain frozen through final doctor. This is original-revision native proof, not a live run of later review fixes or packaging.

All 116 ledger IDs remain accounted for with 102 PASS, one ISSUE and 13 UNRUN. Supported catalogs, availability, Calendar and Planner, normal small bulk mutations, Reports, Personnel and Organization exports, Dashboard failure/retry and held cross-Organization reads pass. Revoked Calendar grants now include direct HTTP 403, native reload, visible in-app navigation denial and restored recovery. Terminal phase 10 passes all 11 cases.

The two owner-deferred native IDs are P03-14 and P05-13. The 11 scope-adjusted IDs are P05-10, P05-11, P05-12, P05-14, P05-15, P05-16, P09-02, P09-03, P09-04, P09-05 and P09-06. No fresh native giant-cohort, duplicate Planner failure, Calendar held-read or held-save credit is claimed. Protected atomic-removal and unchanged UI observations retain their original prerequisite/baseline revisions. Robert narrowed the selection to normal supported workflows and matching proof reuse.

P04-12 remains ISSUE. A manually crafted second Assignment batch date returns HTTP 500 with no saved effects. Regression is not established. [#1557](https://github.com/waffleflopper/trooptotask/issues/1557) retains this nonblocking Very low likelihood observation. [#1559](https://github.com/waffleflopper/trooptotask/issues/1559) retains the optional single-Person scoped-read optimization with Low likelihood. Neither expands this repair.

Final clean-seeds completes before the full 76-set read at `2026-10-07T02:44:26.201326+00:00`. All 233 checks pass. Exactly five declared original rows are consumed by terminal catalog deletion/reset; 148 full same-ID originals remain exact, comprising 63 business rows and all 85 memberships. All 45 temporary IDs are absent. The reset adds 44 independently expected federal holiday rows, the original custom closure remains, and foreign Organization rows are unchanged. Catalog deletion produces ten correct notifications and three audits. No artificial original-row restoration is claimed.

Final doctor and cleanup pass. Root directly confirms all 32 recorded processes absent, ten owned ports refused, owned containers/network/volumes absent, worker directory and TMPDIR absent, and all 41 preexisting container IDs/names/states preserved. Ninety PNGs and 13 actual Blob downloads supply native and export observations. Failed commands, zero-byte HTTP attachment limits and bounded feedback observations stay in the worker report.

Hosted review identifies three actionable corrections, prepared at `bf7124a3`: add unique secondary ID order to paged Calendar reads while preserving their primary sorts; reject invalid Assignment slot input as HTTP 400 before effects; and correct the Reports cleanup recipe for declared destructive terminal effects. Eight focused suites and 87 tests pass, types report zero errors/warnings, and changed formatting/lint/governance pass. Independent repair acceptance reports Standards GO and Spec GO with no consequential findings. The malformed-date batch issue is separate and remains unresolved.

The repair changes no routes, UI, authorization, context composition, DTOs, valid mutation effects, narrow remover or SQL. Dense-page completeness and invalid-slot errors are checked at the changed provider/operation boundaries and adjacent routes. Matching native observations remain bound to `0fd05c9e`. Instruction-only main `8b5ba95b` is adopted after owned closure. Packaging changes no executable inputs. These differences indicate focused verification and evidence reuse, not another complete manual sweep. Full current-head CI and completed clean bot review remain required.

## Durable final evidence

The [final archive](d28-calendar-owner-final-0fd05c9e.tar.gz) contains 4,438 payloads, including 4,430 raw files plus their original inventory and supplemental metadata. Archive SHA-256 is `9168f32dd866658f09ad7bdcd93f0283418b84da674d006d4c4515035fc230c7`. Root fresh extraction checks the complete file set, every byte size and every expanded hash. Use the baseline extraction command above with this archive; its `inventory.json` uses the same `path`, `bytes` and `sha256` entries.

The archive includes the worker report/receipt, root resource closure, accepted repair reports and explicit reuse notes. Raw privacy projections omit credential-bearing headers and unrelated Docker Kong Command fields, with original byte/hash declarations. Product outcomes and container identity/state observations remain unchanged. Packaging integrity is separate from independent behavioral acceptance. Separate independent final artifact acceptance reports Standards GO and Spec GO with no consequential gap. The reviewer checks the complete expanded inventory, recomputes all original/final row sets, holidays and deletion audiences, inspects selected native/export observations, and accepts the eleven-case matching-proof reuse. This is artifact review, not independent live execution. Stale resource/terminal reader scripts retain older bindings and are not executed in this run; actual readbacks, cleanup records and root direct inspection supply the current proof.

Exact-head CI at `0fd05c9e` passes 717 suites and 7,217 tests, types with zero errors/warnings and the production build. That result belongs to the original head. The final repaired publication head requires its own full CI and completed bot review before authorized merge. No new migration or remote database operation is included. #1376 remains open for Personnel/Groups, Training, Onboarding, residual settings and final facade removal.
