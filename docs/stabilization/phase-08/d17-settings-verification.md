# D17 settings and destruction verification preparation

This intermediate `Refs #1365` [PR #1480](https://github.com/waffleflopper/trooptotask/pull/1480) adds the missing [Organization settings/destruction recipe](../../../.agents/skills/verify-trooptotask/features/organization-settings-destruction.md), positive B-owner/dual-admin fixtures, scoped setting readbacks and exact-action failure controls. It changes verification inputs, not application behavior or migrations. Its outcome is usable preparation and truthful unchanged-app observations, including failures; it does not accept the D17 cutover or unlock D18.

## Selection and acceptance boundary

D17 [#1365](https://github.com/waffleflopper/trooptotask/issues/1365) is an open native child of Phase 08 [#1281](https://github.com/waffleflopper/trooptotask/issues/1281), milestone 6. Paginated issue/PR reconciliation found no competing D17 work. Prerequisite D05 closing [#1404](https://github.com/waffleflopper/trooptotask/pull/1404), `ee8f00a2`, is an ancestor of fetched default `73cc63fa0118d4914ecd0524e34f1f7fdf49a9d3`. Robert assigned #1363 to another agent; its worktree, services and task records are preserved. Robert authorizes publication and exact-head green/completed-review merges without migrations, followed by continuation of this issue only. A migration deliverable requires his manual remote application; no agent remote database operation is authorized.

R1/R4/R5 and #1365 establish expected governance, retained URLs, Organization/Group language, confirmation, current sensitive-action assurance and destruction effects. The new recipe covers General, Policies and Danger; existing member/ownership and Organization-switching recipes retain their authority. Lower-level checks complement these journeys rather than converting source inspection into live proof. Verification defects found in scope remain owned by D17 below.

| Whole-issue requirement                                 | This deliverable                                                                                                                           | Remaining D17 work                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile/slug operations, provider and reverse consumers | Baseline name/slug confirmation, persistence, conflict, canonical paths and ordinary denials                                               | Organization ownership, General models/view, resolution/admission/shell/Dashboard/feedback/export consumers and removal                                                               |
| Policies, scalar reads and reverse consumers            | Independent saves/retry, Archives scalar, direct cap/invalid/denied API observations                                                       | Organization command/read/provider and Policies workspace; Personnel/Calendar/Dashboard/Rating Scheme projections, scheduled retention/export consumers and meaningful failure checks |
| Destruction and governance                              | Confirmation/cancel, owner-only requests, actual elapsed-session handoff, fresh explicit deletion, exact row IDs and one real file witness | Repair hidden failure feedback; complete same-page verification/explicit retry, changed owner/name and provider/concurrency cases, Organization ownership and actual Storage cleanup  |
| Legacy `/api/units`                                     | Effective owned catalog has no relation; normal valid request fails 500; repository route/test/policy-only caller inventory                | Retire orphan route/tests/policy within supported-interface audit; external caller surface remains uninspected, retained Groups unchanged                                             |
| Complete removal/acceptance                             | Affected feature map, fixtures, controls and durable baseline evidence                                                                     | All required callers/models/adapters/manifests/obsolete docs, integrated DoD and independent final acceptance; issue remains open                                                     |

## Frozen runs and observed results

All four runs used the unchanged production-built application at `73cc63fa`, fresh synthetic Supabase providers, Chromium **152.0.7977.82** on Arch Linux, and the owned native DevTools controls. Ordinary UI/API actors used normal sign-in. Provider/catalog readbacks used only the isolated owned provider and are separate privileged observations. No existing local or remote database was reset, queried or changed.

| Run       | Executable/instruction candidate SHA-256                           | Owned session and app origin                                     |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Baseline  | `ead59b8fbf81a43ced6bde1d432cfba7ea747e622d4d09c963bab2b696897222` | `1daa760d-c330-43cb-8eb7-5ade87a9fb5c`, `http://127.0.0.1:36329` |
| Follow-up | `94b9f79d88895b71a6fa3f16f3ee0b4d2fab5de0f1db0a39dc9c00f4dd98438e` | `269aeba6-7a60-431d-88b8-55beadbfb4b2`, `http://127.0.0.1:35229` |

Two review follow-ups use the same unchanged application tree at source revision `56fa842b`, with further verification-only changes:

| Run                 | Candidate SHA-256                                                  | Owned session and origin                                         |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Settings-request    | `a62af00c4175102872d2389172161c8cfe0737675debfdaf35d0dd87f109b83e` | `19bb4ead-725a-4867-8117-460874d14f7e`, `http://127.0.0.1:36523` |
| Form-control review | `7fb9f80195c30bb54658ad9bfe32d2da529fd98c0a654f924d3b4633ade2b3b2` | `b8a104e0-3c28-43cb-a58d-c0c896650488`, `http://127.0.0.1:38755` |

The follow-up adopted two fixture actors and corrected a preparation limitation: UUID-only controls missed settings requests after slug canonicalization. Settings controls now resolve A's current saved canonical segment and bind the exact form action; slug update/reset and delete failures, plus a held policy response, exercised this correction. Restore/rearm is required after changing a slug. No application repair occurred between runs. Later archive/prose additions change the checkout fingerprint but do not constitute a fresh live run.

**Profile and policies:** Baseline admin confirmation cancellation preserves the saved name and returns focus; injected name failure keeps the draft and does not persist it; the same visible retry saves the normalized name with its original ID, reflected after reload. Slug save updates canonical links and UUID access; invalid/reserved/short requests fail; reset restores UUID/null slug and retires the old path. Follow-up B's owner saves a real competing slug; A's visible conflict shows an alert and preserves both rows. A changes to a second slug; injected update/reset failures retain the entered/current values and saved target. Independent retention/warning UI saves preserve other fields, failed retention retains the draft/unsaved state, retry persists and reload agrees. Archives displays the saved 48-month scalar; this is not a cleanup-job run. Normal API cap 11 MB saves 11,534,336 bytes and preserves other fields; cap/policy values are restored. Empty, out-of-range/nonnumeric and retained Critical Tasks inputs fail. The invalid-input batch lacks individual immediate row readbacks; do not infer more than its recorded responses and partial-field checks.

**Ordinary denial:** A member's settled General page denies entry and valid name/slug/delete actions and policy API deny writes. Admin deletion denies owner-only authority. Admin requests targeting foreign B return hidden-target 404; B's ordinary member General access denies. SvelteKit outer HTTP 200 failures carry status 403/400; record transport and action status separately. Invalid input alone is not authority proof. D05's accepted sole-owner transfer is applicable to its unchanged operation, not live delete-after-transfer proof.

**Sensitive-action assurance:** A recorded normal login at `2026-10-02T05:58:38Z` remains in the same unexpired context. The ordinary direct delete at `06:14:17.792Z` fails `denied.staleSession`, and the real native submit navigates to `/auth/login?reauth=1&next=...settings%2Fdanger` without deleting A. A separate fresh normal owner context then explicitly confirms/submits deletion and returns to `/dashboard?show=all`; reload shows no A workspace and an already-open admin route reloads 404. This proves the actual elapsed handoff and separate fresh explicit deletion; completing normal reauthentication and returning in that same page remains unrun.

**Review follow-ups:** CodeRabbit CLI identified missing supported direct-request instructions. The new `settings-request` command uses the signed-in native page's normal session for five fixed JSON/form families and allowlisted scalar fields. Its privileged canonical-target lookup is separate from the ordinary request. The third run saves a slug and 11-MB cap, observes member policy 403 and four valid action-envelope 403s, owner foreign B policy/name/delete 404s, wrong saved-name 400 and mixed Critical Tasks/retention 400. Its after-denial A row differs only by the admitted slug/cap; final A/B full settings exactly match originals. Redirect action envelopes are recorded without following or replaying them in UI.

Hosted review found that a matching GET action query could consume the form control's ordinal. The effective method now honors fetch init overrides, then Request.method, then GET; only POST matches a form control. The fourth run observes matching GET 200 with no control calls, then the native confirmed name POST receives the intended 503, visible error/draft and unchanged row. Restore and the same visible retry save the name; an ordinary helper request restores it, and provider/read-after-reload returns the original name. The new target-isolation recipe records the exact already-executed second-run sequence; it changes no expected result or driver action. Ten focused helper tests independently cover request transport/privacy, field/path/origin exclusions and effective Request-method precedence.

**Actual destruction:** The baseline's Organization-filtered counts (119 A rows to zero; 33 B rows unchanged by ID) do **not** prove every row was deleted. The follow-up captures full before-values and then queries each recorded ID independent of its Organization foreign key: **104 recorded A rows disappear; four audit rows survive with `org_id = null`; all 37 recorded B rows retain identical full values**. This matches the effective `audit_logs` SET NULL FK and distinguishes detachment from cascade. Empty fixture tables cannot witness a cascade. A known private signed-roster PDF remains downloadable through privileged owned readback after both real deletes: baseline 3,205 bytes / SHA-256 `bd3d62d1599cb56dd832f37ce0df84c726b2311acab0133ea785eb84759a0747`; follow-up 3,205 bytes / `21f800819e91b2f91589ab4528cc4056dc93dc79a4c65ffae42ab096c13c2403`, each unchanged from its own before-file. This is one seeded actual-byte witness, not all file families, native upload or ordinary post-delete download authority.

## Failed baseline contracts and unrun scope

1. **Hidden delete error:** both injected action failures leave the dialog open with confirmation/retry retained, but `deleteError` renders only behind its inert/blurred background. The user cannot see the failure in the active dialog. D17 owns a visible dialog error/retry repair.
2. **Policy target bleed:** follow-up dual admin persists A retention 36→49, holds its real 200 response and switches through the visible menu to B. B's page still displays 49/saving; releasing A's response marks B's view Saved and announces success while B's authoritative value is 36. Reload shows B's actual 36. D17 owns target-bound workspace reset and stale-response/feedback rejection. A retention and B slug are restored through admitted UI before destruction.
3. **Storage survives destruction:** the PDF witness remains after actual Organization/roster deletion. D17 owns real Storage cleanup before parent authority disappears, including the authorization and partial-failure ordering decision. Current ordinary Storage policies require live parents/membership; complete prefix/orphan cleanup likely needs a narrow owner-only policy migration. No migration or privileged runtime shortcut is added here.

The UI's claim that audit data is destroyed conflicts with actual SET NULL behavior. D17 must reconcile truthful presentation while preserving existing audit/security provenance; this observation adds no new durable-retention policy. Dependent destruction/policy cutovers stay blocked on matching repairs. Profile paths may proceed as their separate complete contract.

Remaining live scope includes same-page successful step-up/return/reconfirmation; saved-name/owner transitions across open Danger; concurrent slug/profile/deletion writes and real provider failures; all artifact/Storage families and orphan objects; dated loss-warning projections in Personnel, Calendar, Dashboard and Rating Scheme; scheduled retention/export execution; broader direct/reverse and removal acceptance. External Units callers have not been inspected. These remain with D17, not passing preparation credit or another issue.

## Durable artifacts and checks

Sanitized raw captures remain in separate archives; no credential redactions were needed. Text was scanned for credentials/JWTs and relevant screenshots inspected; captures contain only synthetic identifiers/emails, public loopback paths and action/results, never credentials/cookies or signed URLs. Native UI, direct normal-session requests and privileged provider/SQL reads remain distinct. A driver ambiguity on duplicate Update URL controls was corrected by selecting the latest dialog's UID before submitting. Initial unsupported launcher subcommands were replaced by the documented control helper; they did not mutate application data.

| Archive                                   | Payload files / expanded bytes | Archive SHA-256                                                    |
| ----------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| [Baseline](d17-settings-baseline.tar.gz)  | 123 / 2,221,575                | `18ae923f5d72e1384c77d2b0fdfe8aed75973cc2d82679a37a1e45efb419111e` |
| [Follow-up](d17-settings-followup.tar.gz) | 104 / 678,233                  | `f6cdd32593f501373e128c4093c8c27760ffd433e411e51c1085528fd75081aa` |

Two further archives retain the request/control follow-ups:

| Archive                                               | Payload files / expanded bytes | Archive SHA-256                                                    |
| ----------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| [Settings-request](d17-settings-request.tar.gz)       | 27 / 16,798                    | `71db5d709d5c3de9dbc9180c13f01e29b3cfcbc9df4c56a7e6779197b9ef7996` |
| [Form-control review](d17-form-control-review.tar.gz) | 28 / 73,226                    | `454dc28dca8fcd1542b3049b9ec4cb8f8a8983a8a4b0d4a9f7eed7e11afb93bc` |

Each contains `INVENTORY.json`, mapping every original relative payload filename to the SHA-256 of its expanded bytes. All four were extracted into separate fresh ignored directories and the exact payload set and every hash verified. To reproduce, create a fresh ignored directory for each archive, verify its hash above, then:

```bash
tar -xzf docs/stabilization/phase-08/d17-settings-followup.tar.gz -C "$D17_EXTRACT"
python3 - "$D17_EXTRACT" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
expected = json.loads((root / 'INVENTORY.json').read_text())
actual = {
    str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
    for p in root.rglob('*') if p.is_file() and p.name != 'INVENTORY.json'
}
assert actual == expected
print('Exact payload set and every SHA-256 pass:', len(actual))
PY
```

All four final doctors, `clean-seeds` and exact owned `verify:app cleanup` pass. The tested application, controls and instructions remained frozen through each run. Node network/settings-request checks pass **10 tests**, including exact action/tenant exclusion, real SvelteKit failure deserialization and retry. Existing focused administration, slug, policy API, Danger action/model and identity tests pass **6 files / 120 tests**; no General action test is invented. Database acceptance is inapplicable because this deliverable changes no schema/policy; catalog/row observations are not fresh/upgrade SQL contract credit. Local tools were Node 24.21.0, npm 11.19.0 and CodeRabbit CLI 0.8.2. Initial [Actions `36973976438`](https://github.com/waffleflopper/trooptotask/actions/runs/36973976438) passes full DoD/build at `56fa842b`: 630 suites / 5,793 tests, Svelte/types 0/0 and governance 506/no regression; DB checks correctly skip, Vercel passes. Existing lint/build/action-runtime notices remain. This is the identified initial commit's evidence; the corrected final head needs its own complete CI result before merge.

Initial CLI reviews all 10 readable files of the complete 12-path diff against `73cc63fa` and raises one valid request-control gap. Hosted review at `56fa842b` raises the separate GET-filter finding. Both are repaired and have matching bounded proof above. Independent source/expanded review accepts the preparation scope and remaining issue accounting; the initial recipe author cannot independently accept their own authorship, so CLI/hosted review supplies that file's separate review. The refreshed complete changed scope, final CLI/hosted disposition and exact-head CI remain merge gates. Archive review is separate from CodeRabbit source coverage, and artifact acceptance is not independent live execution.

There are no runtime release changes or migrations. CI runs full application checks for executable verification changes; branch publication may trigger Vercel under existing external settings, which have not been inspected. No remote action is performed.
