# D17 — Policies acknowledgement and deletion feedback

This intermediate `Refs #1365` repair follows integrated verification [#1480](https://github.com/waffleflopper/trooptotask/pull/1480), base `686ca07d84aac29f80542b0a5c112765924d2391`. The [preparation receipt](d17-settings-verification.md) remains the unchanged-app baseline and whole-issue acceptance map. #1363 is separately owned. Robert authorizes non-migration merge after exact-head green CI and completed review with no actionable feedback, followed by this issue only.

## Declared scope

Repair Policies draft/busy state crossing Organization switches, late feedback from disposed workspaces, and acknowledgement of the submitted value while a later edit stays dirty. Preserve independent partial saves, canonical URLs, server rounding and normal authority. Render delete errors through the shared Alert inside the active confirmation dialog while retaining text, retry and Cancel. A route-local child remounts by canonical UUID, with a lifetime guard; this adds no provider request, refresh waterfall or generic abstraction. Both saved-state methods have only this Policies runtime caller.

The recipe now drives delayed synthetic failures through a narrowly scoped `arm-hold-fail` POST control for Organization policies. This prevents provider admission and proves client timing, not server rollback. Other control behavior is retained.

No provider/policy/SQL change or complete Organization ownership cutover is claimed. General/Danger lifetime isolation, profile/slug and policy ownership with reverse consumers, full destruction/Storage cleanup, audit wording, units disposition and remaining assurance/denial variants stay D17-owned. Existing D05 owner transfer and baseline denial evidence apply to unchanged contracts; this repair does not reaccept those entire journeys or close #1365.

## Verification status

The existing baseline observed held A success carrying 49/Saved into B whose row remained 36, and deletion failure rendered behind the modal. Focused interaction tests now cover both policy fields across A→B→A, old A completion while a newer A save is pending, later edits, server rounding, retry, and an alert inside the active delete dialog. An initial test harness omitted route props and used an exact busy label that did not include the shared spinner's accessible name; those harness failures were corrected. The launcher refused an initial source-changing candidate with `STALE_CANDIDATE`; no proof was driven there. Restart initially passed but its supervisor later exited during the delayed-failure drive; subsequent doctor/tools refused the unavailable owner and owned cleanup passed. That attempt stays partial. A fresh session completed the final proof below.

## Frozen native results

Both attempts use executable/instruction candidate `4e6020e49dd6efc6e2ba3a151010786c76a3cc10972d8ab0748b7026313d0980`, base revision `686ca07d` plus this repair patch. Node 24.21.0, npm 11.19.0 and Chromium 152.0.7977.82 on Arch Linux drive the isolated production build. Ordinary actors enter through normal sign-in; `rows` are separate privileged observations of the owned synthetic provider. No existing local or remote database is touched.

| Run     | Owned session / origin                                            | Disposition                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partial | `c4f1c077-f59d-4e18-9e07-d289ec248c08` / `http://127.0.0.1:42165` | Initial freshness failure preserved; restart passes. Held-success switch and later-edit/retry observations pass, but supervisor exit leaves no final doctor. Cleanup passes; not complete acceptance. |
| Final   | `3fb941fa-dc6e-46e0-bfca-5960fc54a8cc` / `http://127.0.0.1:43405` | Start/final doctor, seed cleanup and owned disposal pass. All claims below refer to this run.                                                                                                         |

Final A is `13ea7445-a49f-429e-9ceb-1e10fafc6492`; B is `6b570645-39e8-4541-86db-68808f625993`. `orgSettingsSwitch` is the existing admin in A/B with no feature lanes; `orgOwner` owns only A. No actor is upgraded.

- **Held success:** native A retention save persists 49 while its real 200 is held. Visible Switch organization → B loads B's 36/180 with idle Saved state. Releasing A adds no success/error feedback and leaves B displayed/stored 36/180. Snapshot, feedback observer, full row and screenshot agree.
- **Delayed failure / return:** one synthetic retention POST 503 is held before provider admission. Visible A→B→A returns fresh defaults and idle state. A's new native warning save submits 30.4, commits/displays 30, and emits its own success. Releasing the old 503 adds no stale error or busy/draft change. B's full settings row remains original.
- **Later edit / explicit retry:** submit retention 48, observe stored 48 while held, then edit the same field to 50. Release shows 50/Unsaved with an enabled Save while storage remains 48. The explicit visible second Save persists 50. A subsequent synthetic failure retains entered 36/Unsaved, emits error only and leaves stored 50; restoring the hook and the same visible retry persists 36. A separate warning save restores 180; reload and both full row readbacks exactly match original settings before deletion.
- **Active delete feedback:** freshly signed-in A owner confirms the current name. A synthetic named-action failure shows the shared assertive Alert inside the still-open dialog, retaining name and enabled retry with unchanged A row. Desktop and 390×844 mobile screenshots are readable. Switching Chromium to mobile reloads the page; the first narrow screenshot therefore shows the page without the old dialog. The failed confirmation was explicitly repeated at that viewport before accepting narrow visibility. Cancel closes it, restores focus to Delete A and preserves A's full row. At restored desktop viewport, a new failed confirmation followed by restoring the hook and pressing the same dialog's Delete Permanently succeeds, returning to `/dashboard?show=all`. A's Organization row is absent and B's full settings row remains original. This does not claim fresh cascade, audit or byte-removal proof.

Both-field late success/failure A→B→A, an old A response while a newer A save is pending, same-field later edits, both-field rounding and retry are also exercised at the real route/component boundary. The newer-A-pending variant is a component observation, not a live browser claim. Canonical slug routing, General/Danger target isolation, direct denial/elapsed step-up, scalar reverse consumers and actual Storage effects are not freshly driven here; applicable unchanged contracts retain the preparation/D05 evidence and unresolved requirements.

## Durable artifacts

Each archive contains an `INVENTORY.json` mapping every payload filename to its SHA-256. Payload bytes are unredacted synthetic observations; credential/token scanning has no hits. All images were inspected, including the narrow reload observation. Re-extraction into fresh ignored directories verified exact payload filename sets and every expanded hash. Later archive/prose additions change the checkout fingerprint; they do not claim another native execution.

| Archive                                         | SHA-256                                                            | Payloads / expanded bytes |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------- |
| [Partial attempt](d17-settings-repair.tar.gz)   | `e9087f8fc0cdede2b9ba7586d6ca6d19d3feff402e99ef3714620ba3b62ff6f2` | 58 / 299,762              |
| [Final proof](d17-settings-repair-final.tar.gz) | `066d8fb8e9feba11d52a2f29f2e5c0e287bc5bdf9e7ee307d0a3561e1c9b6025` | 130 / 998,657             |

Extract with `tar -xzf docs/stabilization/phase-08/d17-settings-repair-final.tar.gz -C <fresh ignored directory>`. Parse its inventory, compare the complete file set excluding that inventory, and hash each expanded file. The final archive includes actual focused/type/control logs, the CLI review and changed executable/instruction hashes.

## Checks and review

Three focused suites / 18 tests pass; all eleven retained network/request helper checks pass. Svelte/type checks report 0 errors / 0 warnings; the official Svelte autofixer reports no issues in all four changed Svelte components/modules. Touched formatting, Markdown links and whitespace pass. Full exact-head CI/build remains a merge gate.

CodeRabbit CLI completes with zero findings on all 15 readable paths in the frozen pre-packaging patch against `686ca07d`; it precedes the final proof/result prose and EVIDENCE addition. Hosted review must cover the published final readable diff; independent acceptance must inspect all source and expanded payloads, including the archives CodeRabbit excludes. Those final reviews remain gates. No migration, remote database or external configuration operation occurs. Vercel publication configuration is unchanged; external settings are uninspected. The issue remains open, and D18 remains blocked.
