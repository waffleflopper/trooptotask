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

## Frozen candidate observations and instruction integration

The next run tested `a7602c7ab29d40600a367036bf8b980a3b4a05b5`, digest `57ce2864bc0f8c6a3d74d9cf551b1a00a9e6318bd31132374a63aab3843ecfab`, worker 2 at `http://127.0.0.1:41553`, session `479d74a7-d751-4c22-bbb5-a6673e0f2200`, with the same runtime/browser versions. [163-file candidate archive](d12-batch-proof/candidate-a760.tar.gz), [scoped entry](d12-batch-proof/candidate-a760-scoped-operate-import.png) and [failed-only selection](d12-batch-proof/candidate-a760-failed-only-selection.png) retain actual normal-sign-in actions, provider readbacks and 15 exact comparisons. Launch, both unchanged-digest doctors and completed cleanup pass. Exactly two UI-created People were visibly archived and owner-deleted; original A3/B1 restore exactly. No helper seed was created. A preceding [two-file undriven build/cleanup](d12-batch-proof/undriven-a368.tar.gz) at `a368313c` earns no journey credit.

Native scoped operate Import is available without Add Person; scoped configure has both. Empty and viewer lack Import; separate ordinary authenticated requests respectively return indexed no-effect errors (HTTP 200) and HTTP 403, with no created row. Healthy manager CSV saves two People. Backfill's stale-Group warning is now truthful; a unique match preserves its Alpha Group and blank DEROS. Deliberately unchecked source row 2 remains unchanged; source row 3 saves and unmatched row 4 fails. Review → correct row 4 → keyboard Tab blur retains **one of three** selected rows. The actual retry sends **one** record and saves one, leaving the acknowledged and unchecked People exactly unchanged. Reload preserves IDs/slug/rank/Group/MOS/Duty Role/dates; same-value replay saves zero/skips two.

**Unresolved live failure:** Native scoped two-row creation with a hidden Bravo name still returns generic HTTP 500 and saves neither the colliding nor unrelated Alpha row. The sanitized owned app log confirms the named `personnel_org_slug_key` rejection. Its log sanitizer omits raw code/details, so missing or unusable candidate DETAIL is an inference from the strict extractor, not observed raw metadata. The test fake always supplies detailed candidate text; supported missing/redacted details need a separate reproduction and repair. This run is not final acceptance, despite passing lower-level checks and source review. Earlier successful backfill/selection observations retain their own candidate and scope.

Readback initially used a nonexistent Personnel `name` column, corrected to allowlisted `last_name`. A cleanup lookup used the dialog title as a button label, failed before a click and was corrected with the fresh dialog-scoped Archive control. A private-log lookup initially included the public session UUID in the worker path, then corrected the owned path. All attempt outputs/notes remain; no input changed during driving.

Only after final doctor/cleanup, Robert's merged [#1446](https://github.com/waffleflopper/trooptotask/pull/1446), `3fdcedb848c5586289e2dc6f3c3ff5c35c73ebc8`, was merged as `f58d9891`. Definition of Done and updated verification/stabilization/finish skills were reread. Those six instruction-only changes and later evidence packaging are not a new live run or a changed application observation. Original tested revisions/digests and payload bytes remain intact; the baseline archive was repackaged only to add its inventory, with every earlier payload hash preserved. No historical merged proof is deleted.

## Packaging and review scope

Every archive includes `SHA256SUMS` for all payload relative names and sanitized expanded bytes, excluding the inventory itself. Secret-pattern scans, fresh ignored extraction, exact file-set equality and every expanded hash pass. No capture redaction was needed; the provider log is an explicitly limited name/message/stack excerpt rather than raw error metadata. Representative screenshots were inspected. Archive hashes protect the inventories:

| Archive                                 | Payload files | SHA-256                                                            |
| --------------------------------------- | ------------: | ------------------------------------------------------------------ |
| `d12-batch-proof/baseline.tar.gz`       |           126 | `7411be1d45e2d1d705731b2baf75e36b07dcb03925fd903e64fd64ba2bfd4180` |
| `d12-batch-proof/candidate-a760.tar.gz` |           163 | `75203f7fd786b01e7b138abdce5f8104750a9d88ac12e776c9981cc6f7d22354` |
| `d12-batch-proof/undriven-a368.tar.gz`  |             2 | `d29a9bf59721503f577c763e3e425c78ed6c29dda5940c074ce373ecc91bfb9a` |

From the repository root, substitute each archive path, compare the printed archive hash above and extract into a fresh ignored directory:

```bash
archive=docs/stabilization/phase-08/d12-batch-proof/candidate-a760.tar.gz
mkdir -p .verification/evidence/verify-trooptotask
extract_dir=$(mktemp -d .verification/evidence/verify-trooptotask/unpack.XXXXXX)
sha256sum "$archive"
tar -xzf "$archive" -C "$extract_dir"
(cd "$extract_dir" && sha256sum -c SHA256SUMS && test "$(find . -type f ! -name SHA256SUMS | wc -l)" -eq "$(wc -l < SHA256SUMS)")
```

Local CodeRabbit CLI 0.8.2 completed the committed `480e1e51`→`a368313c` source/preparation diff with zero findings, explicitly excluding three binary proof files; the two-file `a368313c`→`a7602c7a` boundary-test delta also completed with zero findings. Neither reports failed/incomplete/skipped source scope. Independent source/baseline-artifact review is distinct from bot review and not independent live execution. Local governance initially failed the provider test's new delivery import; moving the HTTP concealment assertion into route tests preserves the provider metadata assertion and passes 19 affected tests plus governance (713 remaining findings, no regression). No rule, declaration, scan or assertion is relaxed.

Before the next review, count the complete actual diff against `3fdcedb8`, including all added/modified/deleted proof. Installed help/doctor were inspected. The [current CLI reference](https://docs.coderabbit.ai/cli/reference) specifies a 300-file rejection for remote comparisons, while a local over-limit or incomplete scope is an explicit failed result; it does not publish a numeric local server limit. Do not infer full review from zero findings or omit source to fit. The pre-packaging comparison is 38 rename-aware file changes / 44 distinct added-modified-deleted paths; pending repair and final packaging require a fresh count and completed review.

## Acceptance and remainder

The hidden-collision repair, its fresh native proof, final affected checks, complete Definition of Done checks, proportional bot review and independent full-diff/source-artifact acceptance remain pending. No independent live execution, production parity or remote provider setting is claimed. No migration is planned; a new migration would stop for Robert's manual operation. Existing Vercel Git deployment settings remain external.

Lifecycle/archive/restore/approved deletion, remaining detail/header/readiness/bootstrap consumers/removals, affected Organization/shared-tab response ordering, exports and final integrated whole-issue acceptance remain with #1360. D15 PersonnelOnboarding ownership and other issues/phases remain separate.
