# Training print acceptance for issue 1545

Final PDF evidence and independent acceptance are **pending**. This record preserves the unchanged baseline, two failed intermediate runs, and full checks on the second intermediate source. Archive integrity passes. It does not establish final visual acceptance.

## Design and source decisions

The approved [Print A page in Paper](https://app.paper.design/file/01M3HXNN6A4S0FTNQ88XS9YJ9X/p-3-1) supplies the overview, transposed Training matrix, and loaded-detail appendix. Learned adjustments retain a compact worst-first type-risk summary and allow extra sheets before shrinking text or numbers. Matrix column chunks preserve selected Group or duty-role order. Each Group's totals count all selected types, including types on other sheets. Continuations need white margins, scope, context, and repeated headings. The corrected Sheet 3 export remains a manual comparison reference.

Claude owns the visual implementation. Sol owns print state and lifecycle behavior. `TrainingReportsPage.svelte` captures `TrainingBriefingSession`'s loaded report and matching loaded detail through `TrainingPrintCycle`. Pending or failed selections retain the loaded scope and range. A new scope without loaded rows has no appendix. Native print events and print-media changes capture or release the snapshot. Page disposal clears it. Repeated invocation cannot reopen an active cycle.

Printing consumes existing report and detail data. It adds no report, detail, provider, or clinical-status query or calculation. The appendix prints only the loaded page in canonical order. Excel retains the whole filtered briefing, independent of that page. Source consumers include the report route, session, print components, shared app/sidebar print styling, and unchanged report/export contracts. Other pages must retain their existing print behavior.

The original black-filled private PDF was not reproduced under Chrome 154, including dark theme. The unchanged source lacked a sidebar print-token reset. That omission is a supported explanation, **not a proven cause** of the Chrome 152 attachment. The private original PDF is excluded from every archive.

Four accepted comment deletions and the no-comments source review are complete according to the parent handoff. Parent-reported independent Astra source review of `c2ca46279e45e44072b86bbe1eeadea1a6ab832d` through `8040418e01b95d95e048961946bb944a34be0380` had no actionable findings. That source review does not cover later pagination changes or establish expanded-artifact acceptance. No new review or live execution occurred in this documentation slice.

## Exact run bindings

All browser runs used owned worker 1, native controls, Node 24.21.0, Chrome for Testing 154.0.8037.57, and synthetic disposable-provider fixtures. The private `TMPDIR` was `/home/waffleflops/.cache/t2tp-aknVLp`. Native forms acquired each actor. All recorded doctors and owned cleanups passed before packaging.

| Run                            | Tested revision and candidate digest                                                                                                                                                     | Environment                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Unchanged application baseline | Source `c2ca46279e45e44072b86bbe1eeadea1a6ab832d`, helper-only `e0945b744e748e31a7600b3d01b7c8b52ac86f49`; candidate `9bda2518f2bf730d4285134788107d388215f33db70c81398f9a21a29bb17047`  | Origin `http://127.0.0.1:44641`; session `c35b7f4e-ac47-4324-b421-1243c4213466`; fixture `afb5f7ac` |
| Intermediate round 1           | Revision `8040418e01b95d95e048961946bb944a34be0380`; candidate `25a64757df7bb02d7e636e191e3e63c2c660199a7c3a0c150eab8121e9ef44c2`                                                        | Origin `http://127.0.0.1:46399`; session `c93d92e0-8f7a-4809-8815-1323f475a8c2`; fixture `cb96d64c` |
| Intermediate round 2           | Revision `91c79c6fa2ec32ecc04321560933bcd733071a92`; candidate `3838c1f7813cfe2470e207a5f0ea3a12422bf95aab672cf931f4cc1221368476`                                                        | Origin `http://127.0.0.1:40905`; session `75430f1e-73c7-44a2-bad2-63a8a095a3aa`; fixture `c8dd18c7` |
| Full source checks             | State-worktree revision `0860cfd9ddb577d262427b1b6f0c61c4e7e09472`, tree-identical to parent `91c79c6fa2ec32ecc04321560933bcd733071a92`; tree `fee2b9301b445c27a95fee53baae2b8b16cbd83a` | Node 24.21.0; npm 11.19.0 versus declared 11.12.1; Vitest 4.1.8; Vite 8.0.16                        |

The three browser archives contain their frozen `run.md` observations. The checks archive contains `RESULTS.txt`, `candidate.log`, `results.tsv`, original scripts, environments, and logs. Historical scratch paths inside those receipts identify the original run location. Packaging and the recipe correction change documentation and evidence only; they do not constitute another live run or retroactively change a tested digest.

## Observations and unresolved failures

The independent Dense fixture has 112 Soldiers, 2,632 applicable requirements, 1,272 ready today, 642 ready at horizon, 730 not recorded, 630 expired, and 630 lapsing. Readiness is 48% today and 24% at 90 days. Excel has 1,990 affected requirements. Runs selected Dense and PFC visibly. Every seeded PFC has MOS 68V, so the recorded PFC selection isolates the same cohort as the recipe's additional MOS filter.

- Baseline data, reload, Basic Life Support detail, and complete workbook observations passed. The eight-page report had mostly empty summary/forecast sheets, fragmented matrix labels, and missing continuation context. The fourteen-page dark-detail report preserved appendix rows but lacked continuation scope. Layout failed.
- Round 1 retained readable counts and columns but split the Focus heading from its cards and lost matrix headers/context on pages 4 and 6. Held and failed detail requests printed the retained 25-row page. Release and Retry loaded subsequent pages. Held and failed report requests printed the loaded filters without extra print queries. A held A report released after a visible switch to B left only B's facts. Synthetic 503 injection proves client failure handling, not provider failure. Sign-out timing and a held-detail Organization switch were unrun.
- Round 2's five-page Letter Group report retained the overview, Focus cards, matrix context, selected types, N/A, and totals. A4 still moved Focus to an uncontextualized page and orphaned totals on a separate sheet. The Letter duty-role dated-84-row report also orphaned first-chunk totals and lost the second chunk's repeated header on `dated-page-06.png`. Final pagination acceptance failed.
- Round 2 preserved Basic Life Support pages 1–25, 26–50, and all 100 loaded rows, plus all 84 dated rows in canonical missing-first and expiration-date order. Excel retained five sheets and 1,990 affected requirements. Short counts were 336 applicable, 124 ready today, 68 horizon-ready, 156 missing, 56 expired, and 56 lapsing. A visible goal change from 90 to 80 survived reload and changed the printed goal without changing readiness. The owner restored 90 and verified it. Empty-view proof distinguishes 112 Soldiers with no required types from the authorized zero-Soldier scope.
- Round 2's `printBackground: false` receipts still produced colored fills because of `print-color-adjust: exact`. Those PDFs do not prove that the background preference takes effect. The separate grayscale matrix showed readable counts, drops, N/A, and headings. Backgrounds-off and monochrome proof remain distinct.

All-page inspection is recorded only for the artifacts named in each run note. Round 2 does not claim completed all-page acceptance for `dark-role100-letter-off.pdf` or the uncatalogued Short, changed-goal, and empty-scope artifacts. A contact sheet or extracted final row does not replace manual final all-page inspection and comparison with the approved design.

## Print lifecycle limits and retained gates

Each recorded button invocation produced `beforeprint: 1`, `afterprint: 0` **before** PDF capture. Round 1's fresh native `Ctrl+p` attempt produced zero events. The headless browser exposed no OS dialog. Escape afterward proves neither keyboard invocation nor cancellation. Both live paths are unavailable, never passed.

The [maintained Print A recipe](../../../.agents/skills/verify-trooptotask/features/training-completions-reports.md#verify-print-a-with-a-dedicated-cohort) now records button counts before PDF capture and browser PDF event counts afterward, with a restored observer. PDF events establish the browser rendering lifecycle, not native cancellation. Existing `trainingPrintCycle.svelte.test.ts` checks protect retained loaded data, release, fresh subsequent capture, duplicate invocation, thrown printing, and disposal. `TrainingReportsPage.test.ts` protects button invocation without a report refetch. These checks complement actual native/PDF observations. The keyboard limitation does not weaken data, lifecycle, no-extra-query, or visual gates.

Earlier unavailable attempts remain explicit: Node 26 failed the adapter runtime requirement, Chromium 152 crashed before login, and Chrome 154 print-stream reads failed under system `/tmp`. The unchanged helper worked with the short private `TMPDIR`. Resource exhaustion is an inference for the stream failure. No system configuration was changed.

## Full checks on the recorded source tree

The checks archive records each command, UTC interval, exit code, and complete log. `npm run format`, `format:check`, `lint`, `governance:check`, `check`, and `build` passed. Formatting made no tracked changes. Type checking reported zero errors and warnings. Governance passed without weakening its baseline of 159 unresolved findings.

The first full test run failed 25 tests because private synthetic values in ignored `.env` masked existing `vi.stubEnv` values through `$env/dynamic/private`. Only ignored environment setup changed. The public-only rerun passed **7,149 tests across 713 files**, with none skipped and unchanged source/assertions. The archive preserves both runs and the exact nonsecret overrides, including the unreachable `http://127.0.0.1:9` Supabase endpoint and synthetic keys. It contains no active credentials.

Retained warnings are three Svelte reactivity lint warnings, two ineffective dynamic imports, large chunks, plugin timings, and the adapter's optional `@opentelemetry/api` resolution warning. Build and adapter completed. Expected `bad revision '1234567890abcdef'` stderr belongs to an existing negative CI-selector test. These checks apply to the exact tree above, not Claude's later pending fix.

No SQL or database contract changed, so DB checks are not applicable. No remote or existing local database was accessed or changed by this documentation slice. No deployment was performed or is pending for this slice.

## Durable archives and integrity

Only the four frozen parent proof roots were packaged. Inspection covered text/JSON/log captures, PDF text, workbook XML, and representative rendered captures. Identities and Organization IDs are synthetic fixture values. No real-person data, JWT, active credential, or token-bearing URL was found. No redaction was needed, and every payload byte is unchanged. Browser profiles, credential/session-state files, and the private original PDF are excluded. Recorded session UUIDs identify runs and are not authentication material.

Each archive contains `SHA256SUMS` with original relative filenames and hashes of expanded bytes. The inventory excludes itself. Fresh extraction verified the exact payload file set and every hash, then compared the result to the frozen original root.

| Archive                                                 | Payload files | Expanded payload bytes | Archive SHA-256                                                    |
| ------------------------------------------------------- | ------------: | ---------------------: | ------------------------------------------------------------------ |
| [Baseline](1545-baseline-dense.tar.gz)                  |            48 |             10,768,348 | `a50a324097f68c0932825a253e09012247fda75c35f51a1d95a625fbe9b4914c` |
| [Failed intermediate round 1](1545-final-round1.tar.gz) |            55 |              5,320,979 | `96ba685a4f8b85038c556b022549b1ef50815bb3e6b5454da8e791a9b34a8eee` |
| [Failed intermediate round 2](1545-final-round2.tar.gz) |           124 |             29,129,967 | `c9442570cb98129d106f784bddb60602574428d156a3947228d2308b1c71ced8` |
| [Full checks](1545-full-checks.tar.gz)                  |            20 |                346,878 | `5ae63e4ea93f1019accfc6dd939f55fa1caae600b620ad1bf8c93bb0646e5301` |

Total scope is 247 payload files and 45,566,172 expanded bytes, including 19 PDFs and two XLSX workbooks. The four inventories are additional archive members.

To repeat the integrity check from the repository root, use fresh ignored scratch for each archive. Set `archive` to its path and `expected` to its hash from the table. Run these commands:

```bash
printf '%s  %s\n' "$expected" "$archive" | sha256sum --check -
mkdir -p .verification/evidence
expanded=$(mktemp -d .verification/evidence/1545-extract-XXXXXX)
tar --extract --gzip --file "$archive" --directory "$expanded" --no-same-owner
(cd "$expanded" && sha256sum --check SHA256SUMS)
python3 - "$expanded" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
entries = [line.split("  ", 1)[1] for line in (root / "SHA256SUMS").read_text().splitlines()]
actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
if len(entries) != len(set(entries)) or actual != set(entries) | {"SHA256SUMS"}:
	raise SystemExit("Payload file set differs from the inventory")
if any(p.is_symlink() or not (p.is_file() or p.is_dir()) for p in root.rglob("*")):
	raise SystemExit("Nonregular extracted payload")
print(f"Exact file set verified: {len(entries)} payload files")
PY
```

## Review scope and remaining acceptance

This documentation delivery changes six paths: the recipe, this record, and four archives. Combined with the recorded parent source, the intended diff against `c2ca46279e45e44072b86bbe1eeadea1a6ab832d` contains 23 paths, including 19 readable files and four archives. The source/helpers/tests remain in scope. Regenerate the count after any later fix or evidence addition:

```bash
{ git diff --name-only c2ca46279e45e44072b86bbe1eeadea1a6ab832d HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard docs/verification/training-print-1545; } | sort -u | wc -l
```

No CLI or hosted review was requested here, so no review-tool limit or complete-candidate review pass is claimed. Expanded artifacts still need independent acceptance alongside the complete updated source diff and coverage selection. Checksums establish packaging integrity only.

The parent must add the final frozen revision/digest, fresh final PDF and affected lifecycle evidence, applicable exact-candidate checks, and independent source/expanded-artifact acceptance. Final inspection must cover every page, both paper sizes and background preferences, Group and duty-role continuations, loaded appendix pages, and retained short/empty cases. Unrun sign-out and held-detail switch paths remain explicit until covered or judged against unchanged consumers. Keep the native keyboard/cancellation limitation visible. This record remains the single current acceptance record; no issue closure is claimed.

Documentation validation passed explicit touched Markdown formatting/checking with `--ignore-path /dev/null`, five local links and anchors, the skill-creator validator, `git diff --check`, and instruction/source-consumer review. The extraction commands above also passed for every archive. No application build or tests were rerun for prose. The installed technical-writing and skill-creator guidance informed the edits. Deslop was absent; manual cleanup and the installed unslop guidance removed filler without altering observations.
