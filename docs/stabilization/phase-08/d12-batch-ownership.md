# D12 Personnel CSV creation and date backfill

Intermediate scope for [#1360](https://github.com/waffleflopper/trooptotask/issues/1360), from accepted main `480e1e5142beb3b3a3667b6f956cef78a99a70d6`. This is the owned implementation candidate; final native acceptance and publication gates remain pending.

## Scope and retained behavior

Own CSV creation and ETS/DEROS backfill with both delivery callers, portable input/results, tests and Personnel column definitions. Remove replaced central implementations without facades. Keep maximum 500 rows, request-relative error indices, active rank validation for creation, catalog/legacy rank matching for backfill, Group permissions and unknown-Group handling, literal valid dates, blank-date preservation, active-only matching and stable IDs/references. Backfill does not merge identities. Healthy creation remains one bulk insert; ordinary request-user reads remain scoped.

Restore scoped Import for operate/configure separately from the configure-only single-record Add Person action. Explicit empty scope and missing capability remain denied. Reuse prior import correction and matching evidence only for unchanged behavior, with fresh proof of affected entry, failure, persistence and replay.

The implementation decision for repeated backfill rows is sequential file order against acknowledged dates: equal values skip, blank fields preserve the latest acknowledged value and later supplied dates apply afterward. This is stated explicitly as a routine consistency choice, not a historical live observation or a previously specified winner contract. No extra provider read or concurrent write is needed.

## Unchanged-source baseline

[126-file native archive](d12-batch-proof/baseline.tar.gz), [scoped roster](d12-batch-proof/baseline-scoped-operate-no-import.png) and [partial results](d12-batch-proof/baseline-backfill-partial-results.png) preserve source `1d55d32cb1648f0a54132784601a498f349b5efb`, unchanged application `480e1e51`, digest `58eee024e78c7a2190559966484381555c012b0dd0c22536a4a4ae770c0f5cee`, origin `http://127.0.0.1:43623`, worker 2, session `7896429d-78bb-488f-b138-0dace28ecbfa`. Node 24.21.0 / npm 11.19.0 / Chromium 152.0.7977.82; normal synthetic sign-in, no helper seed. Launch, both unchanged-digest doctors and exact-worker cleanup pass. Eleven exact field comparisons preserve original A3/B1 and successful replay. Two inspected screenshots and scanned archive survive cleanup.

Scoped operate and configure have no Import entry. An ordinary scoped authenticated batch with one hidden Bravo canonical-name collision and one unrelated Alpha name returns generic HTTP 500, saving neither; the hidden and other stored rows are unchanged. This is separate HTTP/provider proof, not unreachable scoped UI success. Manager native healthy bulk creation saves two People; native date backfill preserves IDs/slug/rank/Group/MOS/Duty Role, accepts unique-name matching despite stale Group text and preserves blank DEROS. One matched row saves and an unmatched source row 3 fails. Review failed rows initially selects only row 3; correcting its name and blurring unexpectedly selects both valid rows. The actual retry sends two records, saves one and skips the previously acknowledged row: **failed-only recovery fails**. A later ordinary same-value replay saves zero/skips two without identity changes.

Exactly two manager-created temporary People were visibly archived and owner-deleted with full ranked-name confirmation. Original A/B rows restore exactly. A failed Upload another file lookup at all-success results happened before a click; fresh Return → Import → Backfill supplied the actual replay. An initial inline orchestration syntax error likewise happened before any tool action. All attempted results remain; neither is product-failure or unavailable-path credit.

The real policy/context reproduction fails two scoped Import cases / passes 39. The real component reproduction at `61c00cc5` fails one failed-row correction case / passes 18: its actual retry contains a deliberately unchecked row and an already acknowledged row. Server reproduction at `6e7853e5` fails five cases / passes 36, including actual scoped atomic slug collision, lost partial acknowledgements, fresh-copy repeated-date state and discarded constraint metadata. These lower-level failures are distinct from browser pre-request 503 proof.

## Owned repair and focused checks

Both JSON routes consume `index.server.ts`; portable creation/backfill inputs and results have one consumed leaf. Operations/tests and Personnel CSV columns move under Personnel; the old central paths, duplicate route interfaces and generic Personnel column export/test are removed. Other importers and neutral mapping algorithms are unchanged. Onboarding's creation affordance/query use the mechanically renamed actual-scope helper; action-specific policy is unchanged.

Creation keeps one bulk insert for healthy files up to 500 rows. Only an exact named Personnel slug-constraint rejection for a submitted current-Organization candidate is retried, at most three attempts. Only the colliding slug advances; unrelated candidates keep their slugs. Reads remain scoped; no admin lookup, random slug or retry after an uncertain network/provider failure. Metadata stays internal and HTTP failures remain generic.

Backfill catches only the individual provider update, preserves acknowledged rows, reports indexed unconfirmed failures without provider details and continues independent rows. Later same-Person rows use only acknowledged dates, with no extra read. Conflicting multi-row replay can write again while ending at the same dates; ordinary same-value replay skips. Failed-row cell correction preserves every other checkbox and keeps a valid unchecked edited row unchecked, while an invalid-to-valid correction can select only that row. Mode-specific warnings now describe the retained stored Group truthfully.

Integrated focused checks pass **11 files / 172 tests**, including owned operations, provider/HTTP, real import UI/policy, neutral column mapping and reverse Onboarding consumers. Sequential synthetic-environment types pass **0 errors / 0 warnings** with `PUBLIC_SUPABASE_URL=http://127.0.0.1:59999` and `PUBLIC_SUPABASE_ANON_KEY=ci-synthetic-anon`. Earlier server repair passes five files / 90 tests. Official Svelte autofixer reports zero issues/suggestions for Import and Personnel context. Final production/native proof, complete CI, bot and independent acceptance are pending; no check is weakened.

## Acceptance and remainder

Final repaired live proof, focused/security/replay checks, complete Definition of Done checks, proportional bot review and independent full-diff/source-artifact acceptance remain pending. No independent live execution, production parity or remote provider setting is claimed. No migration is planned; a new migration would stop for Robert's manual operation. Existing Vercel Git deployment settings remain external.

Lifecycle/archive/restore/approved deletion, remaining detail/header/readiness/bootstrap consumers/removals, affected Organization/shared-tab response ordering, exports and final integrated whole-issue acceptance remain with #1360. D15 PersonnelOnboarding ownership and other issues/phases remain separate.
