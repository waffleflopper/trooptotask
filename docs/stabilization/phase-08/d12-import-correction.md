# D12 accessible import correction

Intermediate #1360 / `08-M04-02r` repair from integrated main `c5fa054d2dfd78e4ebf485bf12444d73050d331b`. Frozen application and recipe candidate: `965dcf8ce516d5e572db6b49c2bae0557eb99506`. Publication evidence/prose does not alter those executable inputs. No migration, Personnel operation ownership or whole-issue closure is claimed.

## Outcome and scope

An invalid import row must remain editable while its import checkbox is disabled. The shared preview had forwarded the selection predicate to DataTable's whole-row disabled state. That gave its editable descendants disabled accessibility semantics despite working pointer/keyboard editing. [WAI-ARIA's disabled-state contract](https://www.w3.org/TR/wai-aria-1.2/#aria-disabled) applies the state to focusable descendants too.

Remove only that forwarding. Keep the invalid-row checkbox disabled, every consumer's valid-only selection predicate, status/reason rendering and submission validation. General DataTable behavior is unchanged. The existing Personnel correction test now checks accessible editors, blocking after partial correction, and the existing public `groupName` payload with corrected Rank/ETS. The shared preview test protects valid-only select-all. No new request, provider operation, styling variant, compatibility API or performance claim is introduced.

The five affected consumers are Personnel import, Training completion import, Calendar status import, Critical Tasks task import and Critical Tasks completion import. Personnel/Training have editable cells; the other three render static rows. Their authoritative recipes remain in the maintained [feature map](../../../.agents/skills/verify-trooptotask/features/README.md), with explicit editor or selection expectations. Server policy, Group/rank validation, chunking, same-ID upsert, merge and permission behavior are unchanged; applicable earlier D12/D09/D11 evidence remains separate from these fresh observations.

## Durable artifacts and environment

Complete sanitized raw artifacts survive worker cleanup in these standard gzip/tar archives. They contain actual native tool results, accessibility snapshots, read-only rendered-DOM inspection, synthetic provider rows, CSVs, screenshots and runner/control outputs, not a replacement claim registry. Inspect with `tar -tzf ARCHIVE`; extract into a new scratch directory with `tar -xzf ARCHIVE -C DIRECTORY`.

- [Baseline: 62 files](d12-import-correction-proof/baseline.tar.gz).
- [Pre-drive attempt: 8 files](d12-import-correction-proof/pre-drive.tar.gz).
- [Final: 111 files](d12-import-correction-proof/final.tar.gz).
- [Checks and local review: 7 files](d12-import-correction-proof/checks.tar.gz).
- Uncompressed representative screenshots: [before](d12-import-correction-proof/personnel-before.png), [after](d12-import-correction-proof/personnel-after.png), [reloaded](d12-import-correction-proof/personnel-reloaded.png).

All commands ran from the dedicated `/tmp/t2t-1360-import-correction` worktree. `npm run --silent verify:app -- launch|doctor|cleanup --worker 2` owned the disposable production-mode application, synthetic Supabase provider and private native Chromium profile. Controls used `node .agents/skills/verify-trooptotask/helpers/control.mjs --worker 2`; native interactions used `verify:app tool NAME JSON --worker 2`. Each state-changing native/control process completed before the next user action. No remote, production or existing-local database was accessed. Node24.21.0/npm11.19.0; Chromium152.0.7977.82. T3 preview was available on a blank tab; Robert's explicit native-browser project instructions governed this evidence.

| Run                    | Revision / digest                                                                                               | Origin / session                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Unchanged-app baseline | `a923bfaae6c2555e7f5cf50db39b0f34f62975f6` / `948641db7dc6b02190f543518974d90f4df84639c06eb99f9dcfe045cd4096c2` | `http://127.0.0.1:38981` / `9a321af5-86e9-4eda-9478-450b7f044a85` |
| Pre-drive attempt      | `26978f147b655ee7d7e42b500cac89684929b3b2` / `4270cd7975815d9d2c031db2998a33846a8b15869d2403f1d33d70bb2da93c72` | `http://127.0.0.1:44343` / `1c7be6d4-f7d1-49fa-b926-d030b110bf6a` |
| Final                  | `965dcf8ce516d5e572db6b49c2bae0557eb99506` / `f8777d6853f1768720741fa196f37d06c59dd84371d5f207c4c64eb6cd90292e` | `http://127.0.0.1:36149` / `5cbd5677-4e58-4e1a-99f3-c9158d75bede` |

Baseline application source equals integrated main; its only preparation change strengthens Personnel correction/persistence instructions. Both baseline and final launch/initial/final doctors and cleanup passed with their recorded digests. The pre-drive attempt only opened/uploaded the Personnel file; it saved nothing and earns no final journey credit. A local review clarification changed recipe wording while its cleanup finished, with no subsequent browser action. A fresh owned launch/doctor preceded the entire final drive. Application, fixtures, controls and recipes then stayed frozen throughout final proof.

Baseline A/B Organization IDs: `15295771-9e7a-4f0f-843b-81b3c5bb6bb4` / `ffb65f3a-aa23-46aa-a891-e309a3f1aac4`. Final A/B IDs and exact groups/people/catalogs/dates are in `fixture.json` in the final archive; A is `e4cc5533-8350-4f59-a678-e224f4816fab`. Original Personnel population is A3/B1. Root alone drove worker2. Baseline actors/pages were manager2, trainingConfigure3, calendarOperate4, ictConfigurator5, ictOperator6. Final pages were manager2, orgOwner3 for visible cleanup, trainingConfigure4, calendarOperate5, ictConfigurator6, ictOperator7. These accounts use their dedicated feature capabilities; actor arrival alone earns no acceptance.

## Actual baseline and final observations

Personnel used one valid/selected row, a second row with both bad Rank and impossible ETS, and a third selected row with an unknown-Group warning. Baseline `preview.txt` marks all eight second-row editors disabled; `editor-dom-before.json` shows HTML `disabled=false` under a `TR` with `aria-disabled=true`. Native pointer click, Control+A, typing and Tab still worked. Rank-only correction retained invalid ETS and a disabled checkbox; correcting ETS enabled the row. Preview/cancel left exact A/B rows unchanged. This refines the historical native-fill failure; it does not erase that receipt or claim total functional refusal.

Final `personnel-preview.txt` and `personnel-editor-dom.json` show enabled editors with no disabled ARIA ancestor while the invalid checkbox remains disabled. Actual pointer/keyboard correction again changed Rank to SPC; `personnel-rank-only.txt` retains bad ETS and disabled selection. Correcting ETS to `2027-02-28` enabled the row. Only the corrected second row and unknown-Group third row were selected; the original valid first row was deliberately unchecked. Preview created nothing.

One actual two-record POST was intercepted with synthetic503 before reaching the server. The visible result reported Import failed; exact A/B rows were unchanged. Its available recovery action was **Upload another file**, with Saved0/Failed0 counters and no per-row Review failed rows action. Restore, reupload, repeat the two corrections using native fill/blur, and reselect the same intended rows supplied the successful recovery. This is recovery by fresh review, not retained-draft or automatic-retry proof.

The actual retry POST returned200 and Import complete. Exactly two new rows persisted:

- `00b3e81c-9226-4683-aa04-1a1173b25de9`: `SPC MapInvalid2697, Synthetic`, 68W/Medic, exact A Bravo Group, ETS `2027-02-28`, DEROS null.
- `f4851757-f780-4561-b457-5e9f05679304`: `SPC MapUnassigned2697, Synthetic`, 68W/Medic, Group null, both dates null.

Return to Personnel and native reload visibly retained both names and their Group projections. Exact saved/reloaded rows were identical, original A3 rows remained byte-for-byte equal, B1 was unchanged and `MapImport2697` was absent. Visible archive dialogs and owner Archives/Delete/name-confirmation removed only those two UI-created People. Exact original A3/B1 rows were restored afterward. The first cleanup confirmation used only the last name and correctly left Delete disabled; full displayed names enabled confirmation.

Training's mixed pasted CSV reproduced five AX-disabled editors on the invalid unknown-type row before repair. Native pointer/keyboard correction to Verification Optional Training worked even in the baseline. Final preview exposes enabled editors while its checkbox is disabled; correction enables selection without automatically checking it. Both runs cancelled and exact Training rows stayed unchanged. No new Training persistence/upsert claim is made.

Calendar previews contained one valid Able row, missing Person and reversed-date rows. ICT task previews contained one valid task and one missing Title; ICT completion previews contained one valid All-MOS completion and one unknown task code. Before and after repair, clearing then select-all chose only the valid row; invalid checkboxes stayed disabled with their reasons present. All exact provider rows were unchanged. Final Calendar used Back; both ICT previews used Cancel. Baseline Calendar stayed at preview until owned cleanup. Baseline ICT completion's first file used unsupported `Practical` and correctly produced two invalid rows; its retained artifact was followed by an ordinary Back/reupload using supported `Demonstration`, which produced the intended mixed preview. An initial upload control call used singular `filePath`, failed schema validation before any action, and was corrected to `filePaths`.

Screenshots were inspected for retained statuses and error visibility after inherited whole-row dimming disappeared. Training's existing narrow columns and long inline reason remain constrained; complete fields/reasons are preserved in the accessibility snapshot. This PR is not a modal/layout redesign or full assistive-technology/device certification.

## Checks, review and continuation

The strengthened test failed meaningfully on the disabled ARIA ancestor before repair: 1failed/20passed in two files. The first repaired five-file run exposed an incorrect test oracle expecting `groupId`; bulk import's unchanged public DTO passes `groupName`. Correcting that expectation gave **5files/32tests PASS**. Nearby Calendar/ICT interaction tests stayed intact. This adds consequential accessibility and partial-correction/selection protection without structural snapshots, geometry assertions or duplicate correction coverage.

Focused ESLint, full-PR whitespace and official Svelte autofixer passed; the latter reported no issues or suggestions. A local `npm run check` initially lacked the synthetic public environment and returned10 missing-export diagnostics. Repeating with the CI's exact non-secret `PUBLIC_SUPABASE_URL=http://127.0.0.1:59999` and `PUBLIC_SUPABASE_ANON_KEY=ci-synthetic-anon` passed with0errors/0warnings. No environment file, guard or application behavior changed.

Local CodeRabbit completed the nine-file committed diff at `26978f14` against `c5fa054d`, with one minor source-row clarification. `965dcf8c` explicitly names source row3 as the second data row and keeps unknown-Group source row4 unchanged; runtime/tests are identical. Independent source Standards/scoped Spec acceptance passed at `26978f14`; final artifact/full-publication acceptance and exact-head full CI/completed hosted review are publication merge gates, still pending at this receipt's preparation.

Earlier #1439 merged September30 at `c5fa054d`, tree-identical to accepted head `c4175b9b`, after exact [Depot CI](https://depot.dev/orgs/rvsvvkd4rp/workflows/4sgqn90phj), 601files/5307tests/build, and completed approved CodeRabbit with no actionable feedback. #1360 remains open. Continue only its portable types, record mapper/create/edit/import/merge/archive/restore orchestration, detail/bootstrap and remaining reverse consumers/removals, then integrated whole-issue acceptance. This PR removes no central Personnel operation debt and activates no other issue/phase.

Repository CI has no deployment or remote DB operation. Vercel configuration enables Git deployments; external production settings/parity are uninspected. Robert has authorized successive green, completed clean-review merges for #1360; any new migration requires his manual operation. There is none here.
