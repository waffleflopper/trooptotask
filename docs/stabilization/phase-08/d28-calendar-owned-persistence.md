# Owned Calendar persistence

Refs #1376. The current deliverable moves Calendar catalogs, availability and assignment reads to their three selected owned interfaces, migrates direct and reverse callers together, and removes the five replaced entity implementations. Source integration is complete. Full final-candidate checks, native verification, independent acceptance and publication are pending. This record grants no cutover completion credit.

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

The source cutover changes 79 source/manifest paths. Focused verification passes 44 suites and 287 tests, type checking with zero errors or warnings, governance with 157 retained findings and no regressions, and changed-source formatting and lint. The installed-SDK full-factory test detects deliberately wrong Organization binding and a legacy DELETE-URL substitution; both expected failures are retained in private receipts, the factory is restored byte-for-byte, and its complete 11-case suite passes. Independent comment/suppression review finds no actionable flags. These checks do not establish final native or release acceptance.

## Required final verification

Use a fresh frozen candidate and worker, repeat affected Calendar and direct/reverse behaviors, and run destructive deletion/reset last. Add visible in-app Calendar navigation after grant revocation; the baseline observes a direct HTTP 403 and native reload only. Finish cohort-dependent comparisons before cleanup and read back restored rows after final clean-seeds. Keep the two deferred issues explicitly accounted for without extra extreme-case investigations. Scope-ID paging, explicit empty scope and archived admitted IDs need their meaningful lower-boundary checks; more than 1,000 people is not a required native extension.

The full Definition of Done, installed-SDK full-provider composition test, removal/governance searches, production build, final native evidence, CodeRabbit, independent complete source and packaged-evidence acceptance, exact-head CI and completed clean hosted review remain pending. No remote database access or existing local database reset is authorized.
