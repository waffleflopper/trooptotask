# Manage Organization member access and ownership

An owner edits a member's role, capabilities and Group scope, then transfers owner authority to another existing member
with a confirmed action.

## Sub-features

- `member-access`: owner saves a member preset, area override and Group scope; the member sees the new access after
  reload.
- `off-lane`: a lane whose feature the unit turned off shows `Off for <unit>` with its control disabled and counts in no
  change total. The server keeps that lane's stored level on every save, including a preset change and a promotion to
  Admin and back.
- `role-boundary`: an admin can manage ordinary member access but cannot grant admin or owner authority.
- `owner-transition`: an eligible member becomes owner; the former owner becomes admin.
- `denied-and-retry`: a stale or unauthorized actor cannot change another Organization or transfer ownership; failed
  writes leave saved access intact.
- `member-exit`: a member can leave from Account → Profile (Leave unit); an owner cannot leave while still owning the
  Organization.

## How to get to it (user POV)

As `orgOwner`, open `Settings` → `Members`. Under `Members`, the `Members` table lists everyone with no paging (the
member cell is the row header); each row shows the member's Access lane (role or preset, plus an amber
`+<n> area changes`) and Groups lane (amber `No groups` when empty). Choose `Manage` on a non-owner row; the owner's row
shows a dash in its actions lane, read as `No actions`. The sheet is 560 px wide, titled with the member's email over a
summary line (`Operator · HQ PLT · 2 area changes`) and a 2px rule. Each section is one row with its title on the left
and its control on the right: `Role` and `Preset` as radio groups, `Area by area` with the sentence
`Change an area only when the preset is too broad or too narrow for it.` and six lanes, `Calendar`, `Personnel`,
`Training`, `Critical tasks`, `Onboarding` and `Evaluations`, of `None`/`View`/`Update`/`Manage` (a lane off the preset
shows an amber dot in its gutter and `<preset> gives <level>`), and `Groups` as `Whole unit`/`Selected` with the tree picker
`Groups they work in` and a restating sentence (`Works across all of <unit>, including Soldiers with no group.`, or for
a selection `Sees <Group> and its <n> sub-groups plus <Group>: <people> people. Not Unassigned.`), visible without scrolling at 1440x1000. The
footer has `Remove from <unit>` on the left and `Cancel` with `Save <n> changes` together on the right. At 390 a lane's
control wraps under its label and stays right-aligned. Escape cancels without saving; a save returns focus to the row's
`Manage` button. Below `md` the table keeps the member and actions columns and moves both lanes under the email.
`Remove` lives in the row's `More actions for <email>` menu. For ownership, open `Settings` → `Danger Zone`, choose an
eligible member under `Transfer ownership`, click `Transfer`, type that member's email in `Type <email> to confirm` in
the `Make <email> the Owner?` dialog, and submit `Transfer ownership`.

## Helper controls

```bash
$V actor orgOwner settings/members # owner entry to member management
```

## Driving it with verify:app

Preconditions: `doctor` passes; `$V fixture` identifies Organization A/B, Alpha/Bravo, `orgOwner`, `orgAdmin` and
`orgMember`. Use separate signed-in contexts from `$V actor orgOwner settings/members`,
`$V actor orgAdmin settings/members`, and `$V actor orgMember personnel`. Read original membership IDs, roles, presets,
overrides and Group scope from the owned disposable provider so changes can be compared by ID. Run the transfer after
ordinary access checks because it intentionally changes the seeded owner.

1. As `orgOwner`, find `orgMember`'s row and open `Manage`. Change its `Preset` or one `Area by area` lane and choose
   `Groups` → `Selected`, open `Groups they work in` and check `Alpha`; submit the named `Save <n> changes` button. Capture the action result and
   `Access updated.` feedback, then reload Members and reopen that row. The same membership ID must show the saved
   values and Alpha scope. Read the exact A membership row again; B's matching rows remain unchanged.
2. In the already-open `orgMember` context, reload and visit a retained Personnel or Calendar entry for Alpha and Bravo.
   Expect access consistent with the saved capability and Alpha scope; Bravo must not leak through stale page state.
   Capture route, visible result and, for a denied write/read, the actual HTTP status. Restore the original member
   access through the owner UI and verify the same ID and original values after reload before a later journey uses this
   fixture. For the empty selection boundary, uncheck the last Group in `Groups they work in` while keeping `Selected`,
   save, reload and reopen. The row must show amber `No groups`, the sheet must retain `Selected` with the picker reading
   `Choose Groups` and the amber
   sign-in-but-see-nothing sentence, and the same stored membership must retain `access_scope_kind: groups` with
   `access_scope_group_ids: []`. The member's reloaded Personnel workspace must contain no People. Restore Alpha and
   check that only Alpha returns; then explicitly choose `Whole unit` and verify Organization access separately.
   Clearing Groups must never grant Organization access. Saving may remove redundant capability overrides equal to the
   preset; compare effective access as well as the exact stored delta.
3. As `orgAdmin`, open `Manage` for an ordinary member. Record that `Role` is plain text, not a radio group, and that
   admin rows have no `Manage`. Attempt an admin/owner elevation through the current signed-in form action only when a
   safe request control can submit it; require a denied action status and unchanged membership. As `orgMember`, verify
   the Members route shows a permission error and an authenticated direct form submission is denied. A SvelteKit action
   may return HTTP 200 with a `failure` envelope carrying status 403; inspect both. Repeat with B's member/Organization
   ID and record no A/B mutation. A hidden control alone is insufficient for authorization proof. For `off-lane`, turn
   Training off with `$V settings-request PAGE orgA organization/settings '{"disabledFeatures":["training"]}'`, reload,
   then open `Manage` for a member whose stored Training level differs from the preset level. The Training lane reads
   `Off for <unit>`, its four radios are disabled, and the stored level stays checked. The row's `+<n> area changes`,
   the sheet's `<n> changes from <preset>` and its `gives` lines leave Training out. Change the preset and save; the
   stored Training level for that membership ID is unchanged in the owned provider while the other lanes follow the
   preset. As `orgOwner`, promote the member to Admin and save, then make them a member again and save; read the row
   after each save and require the same stored Training level. Restore with the same request and
   `'{"disabledFeatures":[]}'`, then restore the member's role, preset and lanes.
4. As `orgOwner`, open `Settings` → `Danger Zone` and select `orgAdmin` as the transfer target. In
   `Make <email> the Owner?`, try a mismatched confirmation email: submit remains disabled and owner rows do not change.
   Enter the exact target email and submit; capture the result, then reload both actors' Dashboard and Danger Zone. The
   target is the sole A owner and the former owner is Admin, with their original membership IDs and B untouched. An
   already-open former-owner tab must lose the owner-only action after reload; a stale direct transfer attempt must be
   denied. Verify exact roles through the owned provider.
5. For a controlled transfer failure, capture the visible error, retain the dialog/retry state, and compare owner rows
   before another attempt. Retry only after confirming the first transfer did not commit. Mark this failure path
   unreachable if no owned control can provide a safe failure. Restart the owned worker after successful transfer before
   later recipes depend on the original roles.
6. In a fresh owned worker, confirm the owner has no `Leave Organization` menu action. Submit the current signed-in
   Dashboard leave form directly with the owner's membership ID and `YES`; record the HTTP status and require 400 with
   the ownership explanation and the owner row unchanged. This is an authenticated action check, separate from visible
   UI interaction. For a positive exit, use an expendable accepted member: the sidebar name card → Account →
   `Leave unit` (absent for an owner) → type `YES` in the Leave Organization dialog → submit, then confirm the redirect
   and absence of that membership after reload. Restart the worker after this seeded deletion.

## Group tree scope

After the [Group tree](manage-groups.md#group-tree) build steps, as `orgOwner` open `Manage` for `orgMember`, choose
`Operator`, open `Groups they work in`, uncheck `Alpha`, search `1st squad` and check the `1st Squad 3` row under
`2nd Platoon`. Rows read `<name> <subtree count>`; checking a squad checks and disables its teams. Escape closes the
picker. The trigger reads `Groups they work in: 2nd Platoon › 1st Squad`, the sentence
`Sees 1st Squad and its 2 sub-groups: 3 people. Not Unassigned.`, and Save reads `Save 8 changes` (preset, six lanes and
scope). The saved membership has `member_preset: operator` and `access_scope_group_ids` holding only the squad's ID,
never its teams. Signed in as `orgMember`, Personnel's toolbar reads `Group: 1st Squad 3` with `1st Squad`,
`Alpha Team` and `Bravo Team` bands, and Quick edit's `Group` picker offers only `1st Squad`, `Alpha Team` and
`Bravo Team` with no `No Group Assigned`. Moving Baker from Alpha Team to Bravo Team there reads
`Group Alpha Team → Bravo Team` (paths start below the member's visible root) and saves Bravo Team's ID. At 390 the
picker is a bottom sheet above the access sheet with `Done`; at 1024 it is a popover inside the 560 px sheet.

If a granted Group has since been deleted, reopening Manage drops its ID from the picker and submitted scope. If a
granted team moved under another granted Group, only the ancestor is submitted. Change a preset without touching the
picker, save and reload to check the canonical roots. A Group scope with no remaining Groups stays empty and never
becomes Whole unit. Repeat with a Group removed while its sheet is open to check the current catalog is used at save.

## Gotchas

- Members and ownership candidates load all pages in ascending membership ID order. Compare saved records by ID and full
  facts; require every eligible membership exactly once. A sparse native fixture does not establish large-page
  completeness.
- Organization membership role and member preset are different fields. Only the owner can change governance role or
  transfer ownership; normal capability edits do not make a second owner.
- Owner transfer requires an existing eligible member and sensitive-action assurance. If step-up is required, follow the
  visible verification path and record it; bypassing it does not prove the transfer.
- Member removal is a separate action with a confirmation dialog and ends access while retaining Personnel/Calendar
  records. Exercise it only with an expendable synthetic member; do not remove the seeded owner, admin or cross-feature
  fixture.
