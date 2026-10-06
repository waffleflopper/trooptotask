# D28 atomic Calendar bulk removal

D28 [#1376](https://github.com/waffleflopper/trooptotask/issues/1376), task `08-M15-02`, remains IN PROGRESS. This deliverable repairs supported 500-ID availability removal on main `4d5f8bfb5723752788f96c1666e2c12d50b47682`. It requires a migration and stops before merge for Robert's manual remote operation. The preserved Calendar persistence cutover is not integrated here.

## Reconciled selection

[Personnel repair #1552](https://github.com/waffleflopper/trooptotask/pull/1552) merged at `4d5f8bfb` after exact-head CI/build, completed clean bot review, and independent acceptance. Its accepted `fd7e9b98` tree equals that merge. [Actions 37509388644](https://github.com/waffleflopper/trooptotask/actions/runs/37509388644) passes 715 suites and 7,198 tests. This continuation reconciles actual main, all 15 matching historical PRs, the latest authoritative `currentWork` selection, and the three preserved private worktrees before choosing Calendar.

All three worktrees are clean and unchanged. Calendar is `67fa5713`, Personnel/Groups is `52a8a036`, and Training is `7d6c0a5c`. Their previous sessions are closed. Calendar has 85 intended changed paths against its own base, including an unmerged three-port cutover. Training contributes preparation rather than runtime changes. Its eight failing lower-boundary cases and twelve unrun native families remain explicit. Personnel uses the selected four-port design for roster reads, records, Groups, and self pins.

The bulk-removal repair is a separate cohesive PR because its manual migration must precede application release. Both long-URL reference reads and removal belong in this repair. Importing the broad private cutover would mix that release dependency with unrun acceptance. No private candidate is blindly cherry-picked or reset.

## Permanent removal contract

`CalendarAvailabilityRemovalPort` has `findPersonnelIds` and `deleteIds`. Its adapter captures the ordinary Supabase client and canonical Organization once. At the admitted 500-ID bound, references use five concurrent reads of at most 100 IDs. Mutation uses one body-based `delete_availability_entries` RPC. There is no chunked mutation, automatic retry, generic DataStore expansion, or compatibility fallback.

The DELETE request context exposes only the removal port, existing Calendar roster policy, authorization, and audit. POST remains on its existing context. The operation rejects empty or more than 500 raw IDs before deduplication, preserves Group admission, and audits actual saved deletion count. Missing, foreign, or RLS-hidden IDs retain ordinary visible-subset behavior. Successful replay returns zero.

Migration `20261006000100_atomic_calendar_availability_removal.sql` adds one SECURITY INVOKER function with an empty search path. It checks authenticated identity and current Calendar OPERATE membership, validates raw IDs, performs one Organization-filtered DELETE under retained RLS, and returns ROW_COUNT. Only authenticated callers can execute it. A statement error rolls back the entire mutation. No tables, stored rows, constraints, or RLS policies change during upgrade.

The maintained network observer now records DELETE body IDs. The old observer parsed POST records only and falsely reported zero IDs in the baseline. The saved native request body independently proves the original 500 distinct IDs. The updated recipe covers a fresh 501-Person cohort with exactly 500 saved matches, Back, failure, explicit retry, reload, and unrelated-row preservation.

## Closed native baseline

Current main `4d5f8bfb` runs unchanged with Node `24.21.0`, Chromium `152.0.7977.82`, origin `http://127.0.0.1:34747`, and digest `40ed3d9937d41a66ea25b9c87a39378848c7edd969f6e801bd28df08972764ba`. Session `c5997a6e` creates 500 matching entries for 501 temporary People through native controls. Review shows 500 exact matches. The real 500-distinct-ID DELETE returns HTTP 500. Original plus temporary A 506 and B 1 rows remain identical after failure.

The response says Internal server error. This new baseline does not preserve the server's URI Too Long log, so the URL cause is a source-supported inference and a separate earlier private Calendar observation. The screenshot captures the retained 500-match review after the error toast expired. The immediate snapshot preserves the error. Neither limitation is relabelled as successful proof.

The initial Node 26 launch fails the adapter engine check. The corrected Node 24 run passes. The failed ownership doctor and initial cleanup while the supervisor remains alive are preserved, followed by matching final doctor and completed cleanup. All 501 temporary People and dependent rows are removed by journaled cleanup, and original A 6 and B 1 rows are restored. Both owned attempts close before implementation or packaging.

## Closed repaired native proof

Frozen revision `8d225c0a318758e0d89fad10f42737ac94805277`, digest `38b8b1fde7381f4988b10b2c100bffee93b75857ba49d8fa57d9029ea7062d49`, session `1bdf7346-fe94-44b3-9d51-c54fc9756895`, runs at `http://127.0.0.1:34417` with the same Node and Chromium versions. One root driver owns one session. Source, fixture, controls, and recipes remain frozen throughout the run.

| Observed boundary                              | Result                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Native Add of 500 among 501 temporary People   | Real HTTP 200, 500 exact saved IDs and fields                                                                      |
| Remove review and Back                         | 500 exact matches, all A 506 and B 1 rows unchanged                                                                |
| Synthetic DELETE 503 before provider admission | Retained confirmation and error, all full rows unchanged                                                           |
| Explicit native retry                          | One real HTTP 200 DELETE with exactly the 500 saved IDs, completion reports 500 removed                            |
| Reload and repeat review                       | No matching entries, original A 6 and B 1 full rows exact                                                          |
| Temporary cohort before cleanup                | All 501 People retained despite availability removal                                                               |
| Alpha-scoped operator                          | One reviewed entry removed, reload and original rows exact                                                         |
| Calendar-only operator with Personnel NONE     | Three reviewed entries removed, reload and original rows exact                                                     |
| Viewer                                         | Access restricted and no mutation controls, no native HTTP 403 claim                                               |
| Empty Group scope                              | Zero personnel and disabled Review                                                                                 |
| Cleanup                                        | Temporary cohort absent, original Personnel A 3 and B 1 exact, hooks restored, final doctor and owned cleanup PASS |

`failed-retry.png` contains the 500-match review and failure toast. `success-500.png` shows the reset selection after the toast expires. The immediate native `retry-complete.json` proves successful completion. `reload-empty.png` shows the empty repeat review. Network controls prove browser recovery, while separate real SQL checks prove provider atomicity and denied execution.

Final doctor still matches the frozen digest. The owned worker directory and app port are absent after cleanup. Later archives and acceptance prose are packaging changes, not a fresh native run.

## Lower-boundary and database verification

The initial focused Calendar selection passes 63 suites and 526 tests. Independent review removes three scalar arranged-response assertions that duplicated the adapter's implementation. The final provider and real-route suites pass 15 meaningful tests. The maintained observer passes all 28 checks. Type checks report zero errors and warnings, changed-source lint passes, and governance passes with 159 retained findings and zero new findings. Local full formatting and commit checks pass. The native environment's production build passes with the retained optional OpenTelemetry warning.

The installed real SDK tests cover bounded URL serialization, one RPC body, ordinary authority, late reference-read failure before mutation, malformed acknowledgments without retry or successful audit, and mapped RPC errors. Real-route tests cover Calendar-only admission, actual saved deletion/replay counts, unrelated rows, denied lanes before context construction, raw bounds, and retained POST behavior.

`PATH=installedNode24 python3 scripts/ci/database.py` exits zero. Fresh replay applies 170 migrations. All 63 fresh SQL suites and 1,717 assertions pass, including 33 new removal checks. Six retained migration regression suites and 121 assertions pass. The populated upgrade passes all 25 contracts and 401 assertions, including ten new checks. Both retained provider probe sets pass. Fresh project `t2t-ci-db-fgayvnwv` and populated project `t2t-ci-db-fgp4pddb` close and their temporary directories are absent.

The populated fixture refuses to run after the held migration exists. It preserves eight complete historical domain/reference rows across application, then verifies real ordinary deletion, duplicate count, replay, foreign denial, grants, and unchanged unrelated rows. The fresh contract tests actual denied roles, capability and Group changes, malformed inputs, 500-ID deletion, and a forced AFTER DELETE statement error with complete rollback.

An earlier local `--receipt` attempt fails before starting any project because that option requires real CI ownership metadata. The raw failed attempt remains in the final package. No CI receipt is invented. No remote or existing local database is touched.

## Durable evidence and review

The [baseline archive](d28-calendar-atomic-baseline.tar.gz) contains 88 payloads and one PNG. Its SHA-256 is `b2e48adf96dc89a921658c2f9a1e8e38840691556a3c132a391afb125df1d1a2`. The [final archive](d28-calendar-atomic-final.tar.gz) contains 225 payloads and three PNGs. Its SHA-256 is `35d169eb699f531052fd1c901b25198961395d9365dfc329115dd9bcf818e70c`. Both preserve raw observations and inside inventories. Header-bearing baseline request output is projected to its actual body and response only, with the projection declared in baseline metadata. No credentials are published. Final scanning finds no session tokens and requires no redactions.

Both archives are freshly extracted under ignored scratch paths and every file set, size, hash, and expanded byte matches. Use this verification after extraction into separate empty directories:

```bash
d28_extract=$(mktemp -d)
tar -xzf docs/stabilization/phase-08/d28-calendar-atomic-final.tar.gz -C "$d28_extract"
python3 - "$d28_extract" <<'PY_VERIFY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / 'inventory.json').read_text())
entries = manifest.get('entries', manifest.get('files'))
expected = {entry.get('file', entry.get('path')) for entry in entries}
assert {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()} == expected | {'inventory.json'}
for entry in entries:
    payload = (root / entry.get('file', entry.get('path'))).read_bytes()
    assert len(payload) == entry['bytes']
    assert hashlib.sha256(payload).hexdigest() == entry['sha256']
print(f'Verified {len(entries)} payloads')
PY_VERIFY
```

Run the same verifier against the separately extracted baseline. The archive hash protects its inventory. Hash integrity does not establish behavioral acceptance.

Independent app source/comment review and separate SQL source review report GO with no actionable findings. Source CodeRabbit CLI completes all 18 changed text files at `8d225c0a` against `4d5f8bfb`, zero findings, exit zero. The binary baseline is explicitly excluded from CLI and requires expanded acceptance. Complete independent source, expanded evidence, and decision-trail acceptance remain required for the packaged candidate. Exact-publication-head CI/build/database validation and completed clean hosted reviews are publication gates still pending at this checkpoint.

## Release dependency and remaining work

Robert manually applies `supabase/migrations/20261006000100_atomic_calendar_availability_removal.sql` before this application change merges. He owns the remote backup, migration result, and hosted parity report. This agent stops before merge and performs no remote operation. The additive function is compatible with the old application. The new application requires the function and fails removal if released first. It has no silent legacy fallback.

Repository CI validates disposable databases and has no remote migration job. `vercel.json` builds the app and does not disable this new branch. External Vercel Git deployment settings were not inspected. A push or merge may therefore deploy the app automatically. Owner notice, backup, and schema-before-app compatibility are required before release. The manual migration gate does not authorize this agent to deploy.

After this prerequisite is integrated, Calendar still needs actual current-main integration of its preserved three-port cutover, affected consumers, and native phases 8 through 10. Personnel/Groups still needs its four ports and full caller/removal wave. Training retains eight failing preparation cases and twelve unrun native families. Onboarding, residual settings, and final generic facade removal remain. Final integrated acceptance must satisfy all #1376 requirements before closure. D29 and D30 remain out of scope.
