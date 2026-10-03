# D18 — Settings review interaction repair

## Outcome and boundary

This intermediate `Refs #1366` deliverable follows integrated cancellation #1500 at `bc1cead3`, tree-identical to accepted `110afc52`. It repairs one complete Settings interaction: saved requester identification, review failure feedback and explicit retry, denial drafts bound to their request, truthful pending controls, and stale completion isolation when the canonical Organization or route changes. There is no migration or stronger source/status atomicity promise.

All defects share SettingsActivityRail and its sole production caller, Settings/Approvals. Use the existing canonical Organization key/disposal pattern. Retain saved requested_by_email without an extra user lookup; include cancelled history in the shared row status type. A successful review removes its acknowledged card and refreshes current Settings data. If refresh fails after HTTP acknowledgment, report successful review with unavailable readback, keeping that card unavailable for duplicate mutation. Completing another row preserves an unrelated denial draft.

The following owned workflow cutover has different server/source/delivery consumers: feature-owned list/approve/deny with conditional status acknowledgment, Training Type retry, source pending-guard boundaries, complete Settings/export/Web consumers and old global removal, Personnel bulk baseline/recovery, and final all-source/whole-issue acceptance. Those remain D18; this PR cannot close #1366. Existing effect-before-status non-atomic semantics and separate counseling Storage ordering remain as recorded in the request/review recipe.

## Acceptance selection

The [request/review recipe](../../../.agents/skills/verify-trooptotask/features/deletion-requests.md) owns baseline/final native label, denial reason/reload, failure/retry, pending controls and held Organization switching. Supported authenticated HTTP supplies temporary request prerequisites, identified separately from native creation. Deferred rendered component/route tests cover rejected fetch, malformed/null or delayed error bodies, failed refresh after acknowledgment, A→B→A, leaving Approvals and same canonical Organization with a changed slug. Real connection outage is not inferred from a synthetic rejection.

Source/source-effect policies and existing all-five native review behavior remain unchanged; prior #1498 evidence applies to those untouched server/source paths. New proof must repeat the affected Settings behavior. Full exact-head CI/build, independent complete source/expanded-artifact acceptance and completed clean bot review remain required merge gates.

## Unchanged observations

Owned native baseline at frozen `110afc52`, digest `97901b43…`, reproduces Unknown requester despite persisted requested_by_email, denial reason transfer to another target, enabled conflicting controls during a held real review, and loss of an unrelated edited draft when that review finishes. Injected pre-dispatch503 shows feedback and preserves the same-request draft. Native reload and provider observations retain the actual pending/approved/source outcomes. Final doctor and owned disposal pass.

Native Offline emulation is unavailable because the browser origin allowlist/blocklist disables network throttling. The failed tool result remains evidence; no allowlist was removed and no offline mutation is claimed. Narrow new synthetic rejection and delayed503 controls extend the existing helper and maintain exact Organization/method/endpoint scope. Their standalone meaningful request-isolation suite passes. The supplemental unchanged-app baseline reproduces synthetic fetch rejection with no error feedback and an uncaught handler rejection; explicit retry records real denial 200 with the saved reason. Holding A review 503, switching natively to B and releasing produces A error feedback in B. Exact pending request comparisons, all 12 temporary source IDs/request sets, both PDF removals and matching final doctor/disposal pass. No real outage or provider failure is inferred.

## Durable unchanged evidence

Each archive preserves one completed owned run. Both inventories are freshly re-extracted with exact payload-set and every expanded SHA-256 verification; credential-pattern scans pass. Independent acceptance must inspect their expanded observations with the full diff.

| Run                                             | Archive                                                                          | SHA-256                                                            | Payloads |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Original native and selected component baseline | [d18-settings-baseline.tar.gz](d18-settings-baseline.tar.gz)                     | `617f32ca755e7154816e36b10322c803bbcb95bc16ba72cd0a693e38898e062a` | 68       |
| New-control unchanged-app supplemental baseline | [d18-settings-transport-baseline.tar.gz](d18-settings-transport-baseline.tar.gz) | `7570660bae646671b6cc45ae4a3f4e68cb97769580c90e57738e47bfbe58b3d5` | 100      |

Extract into fresh ignored scratch directories with `tar -xzf <archive> -C <directory>`, then from each directory run `sha256sum -c SHA256SUMS` and compare the expanded file set with the inventory, excluding only SHA256SUMS itself. The archive hash protects that inventory. Counts/hashes prove packaging integrity; actual snapshots, events, responses and readbacks establish behavior.

## Repaired source and lower-level verification

SettingsActivityRail uses the saved requested_by_email and reactive acknowledged request IDs to remove only successfully reviewed cards/counts before refreshing. Error-body validation, rejection handling and explicit retry retain the same draft; all review/draft controls share the existing one-review-at-a-time busy state. Only the reviewed row's draft clears on success. The canonical data.orgId key recreates the rail for another Organization; per-instance disposal suppresses stale feedback/refresh/state writes while preserving a pending operation across a same-Organization slug change.

All 20 meaningful rendered component/route cases pass, without skips or unhandled errors. The selected unchanged-source subset recorded six real failures; 14 cases were runner-deselected for that baseline only. Final test harness locators tolerate the existing Spinner's accessible Loading prefix; no behavior assertion was weakened. The separate network control suite passes nine request-isolation/hold/restore cases. Focused lint/whitespace, Svelte/TypeScript with zero errors/warnings, and official Svelte autofixer for both changed components pass. Those checks do not replace final native proof, complete independent acceptance, exact-head full CI/build or completed clean bot review.
