# Organization switching

A member of two Organizations switches Calendar context without carrying the first Organization's catalogs, saved statuses, late responses or feedback into the second.

## Sub-features

- `switch-catalogs`: A Settings and Calendar show A labels; B Calendar shows only B labels and closure while B Settings restricts configuration.
- `late-range`: an A range response released after switching to B cannot restore A data in B.
- `late-mutation`: a saved A status whose response arrives after switching to B remains saved only in A and shows no stale A feedback in B.
- `permission-narrowing`: an already-open A Calendar loses access when its grant narrows; a denied range/reload stops exposing A labels, presents a settled access state, and preserves historical data.

## How to get to it (user POV)

Sign in as `calendarSwitch`, who belongs to Verification Organizations A and B, and use the `Switch organization` menu. This actor can configure A Settings and view B Calendar; B Settings displays `Access restricted`. Calendar's long-range button requests additional dates; an availability modal submits a status while the page remains open.

## Driving it with verify:app

Preconditions: doctor passes; `$V actor calendarSwitch calendar/settings` returns `PAGE`; `$V fixture` gives both Organization IDs, A/B status/closure IDs and today's date. Keep one page and one browser context for the switch. The `network` helper controls only A endpoints, and every arm must be released/restored after the attempt. Capture route, Organization name, visible labels, request status, and exact saved-row readback before and after switching.

Save the `network arm-hold`, `network state` (while held and after release), and `network release` JSON outputs under the run's evidence directory, alongside the B before/after observations and exact A/B row readbacks. Include actor, page ID and endpoint in the run notes. A B screenshot by itself does not establish that a real A response was held or released.

1. In A Settings, capture `Verification Leave` and no `Foreign Private Status`; in A Calendar September, capture Leave/`Verification Unit Closure` and no B labels. Use `Switch organization` → `Verification Organization B` from a fresh snapshot. B Settings must say `Access restricted`; follow `View calendar` and capture `Foreign Private Status`/`Foreign Private Closure` with no A Leave/closure. Switch back to A for the delayed paths.
2. From A Calendar with an uncovered future range, arm `$V network arm-hold $PAGE calendar-range`. Click `3-Month` or `Next 3 Months`, then require `$V network state $PAGE` to show a real A `200` held. While it is held, use the actual Organization switcher to choose B. Capture B's route/labels before release, run `$V network release $PAGE`, then capture after settlement. B must still show B's status/closure and never A's. Restore the hook. If no range request was intercepted, choose an uncovered range and retry; do not count a cached view as a delayed-response exercise.
3. Back in A after visiting B, open Able's unoccupied today cell, select `Verification Leave`, and fill a unique note. Arm `$V network arm-hold $PAGE availability` and click `Add Status`. `network state` must show the real `200` held after persistence, and `$V rows availability_entries orgA note "$NOTE"` must show one Able/A row. The pending modal prevents the Organization menu from opening; invoke browser History Back in the same page with `tool evaluate_script` and `history.back()` to return to the prior B route. Neither before nor after `$V network release $PAGE` may B show A's note/Leave or an A `added —`/error toast. `$V rows availability_entries orgB note "$NOTE"` stays empty; reload B and confirm the same. Restore the hook and remove only the new A row through the normal A UI when back in A. Record the menu transition as unreachable, separately from the History Back result.
4. With A Calendar open, run `$V calendar-grant calendarSwitch none`, then use the same browser page for an authenticated A `GET /api/calendar-range` over September 14–16. Expect `403` or `404`, no `availabilityAlpha` ID, and a settled access restriction or empty state without A labels after reload; a permanently busy page is a failure. `$V rows availability_entries orgA id <availabilityHistorical>` must still show the March row. Restore with `$V calendar-grant calendarSwitch restore` and doctor before a further drive.

## Gotchas

- Use the Organization switcher for the delayed range. For the held mutation, prepare B as the previous browser history entry before returning to A; the pending status modal blocks the switcher. A navigation that destroys the armed page hook before a response is observed is a control failure, not proof of isolation.
- The held mutation is deliberately persisted before its response is released. Confirm exact A/B rows as well as the visible B feedback; an empty B screen alone does not establish where the write went.
- A narrowed grant is not a data deletion. Restore the synthetic member's original grant even after failure. The Calendar range coordinator/store tests cover additional ordering cases separately.
