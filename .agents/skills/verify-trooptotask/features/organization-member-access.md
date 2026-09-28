# Manage Organization member access and ownership

An owner edits a member's role, capabilities and Group scope, then transfers owner authority to another existing member with a confirmed action.

## Sub-features

- `member-access`: owner saves a member preset, area override and Group scope; the member sees the new access after reload.
- `role-boundary`: an admin can manage ordinary member access but cannot grant admin or owner authority.
- `owner-transition`: an eligible member becomes owner; the former owner becomes admin.
- `denied-and-retry`: a stale or unauthorized actor cannot change another Organization or transfer ownership; failed writes leave saved access intact.

## How to get to it (user POV)

As `orgOwner`, open `Settings` → `Members`. In `Organization members`, choose `Manage role & access` for a non-owner. The `Manage Access` sheet has `Membership Role`, `Member Preset`, `Area-by-area access`, `All groups`/`Selected groups`, and `Save <n> changes`. For ownership, open `Settings` → `Danger Zone`, choose an eligible member under `Transfer ownership`, click `Transfer Ownership`, type that member's email in the confirmation dialog, and submit `Transfer Ownership`.

## Driving it with verify:app

Preconditions: `doctor` passes; `$V fixture` identifies Organization A/B, Alpha/Bravo, `orgOwner`, `orgAdmin` and `orgMember`. Use separate signed-in contexts from `$V actor orgOwner settings/members`, `$V actor orgAdmin settings/members`, and `$V actor orgMember personnel`. Read original membership IDs, roles, presets, overrides and Group scope from the owned disposable provider so changes can be compared by ID. Run the transfer after ordinary access checks because it intentionally changes the seeded owner.

1. As `orgOwner`, find `orgMember`'s row and open `Manage role & access`. Change its `Member Preset` or one `Area-by-area access` option and choose `Selected groups` → `Alpha`; submit the named `Save <n> changes` button. Capture the action result and `Access updated.` feedback, then reload Members and reopen that row. The same membership ID must show the saved values and Alpha scope. Read the exact A membership row again; B's matching rows remain unchanged.
2. In the already-open `orgMember` context, reload and visit a retained Personnel or Calendar entry for Alpha and Bravo. Expect access consistent with the saved capability and Alpha scope; Bravo must not leak through stale page state. Capture route, visible result and, for a denied write/read, the actual HTTP status. Restore the original member access through the owner UI and verify the same ID and original values after reload before a later journey uses this fixture.
3. As `orgAdmin`, open `Manage access` for an ordinary member. Record that `Membership Role` is read-only. Attempt an admin/owner elevation through the current signed-in form action only when a safe request control can submit it; require a denied action status and unchanged membership. As `orgMember`, verify the Members route shows a permission error and an authenticated direct form submission is denied. A SvelteKit action may return HTTP 200 with a `failure` envelope carrying status 403; inspect both. Repeat with B's member/Organization ID and record no A/B mutation. A hidden control alone is insufficient for authorization proof.
4. As `orgOwner`, open `Settings` → `Danger Zone` and select `orgAdmin` as the transfer target. In `Transfer Ownership`, try a mismatched confirmation email: submit remains disabled and owner rows do not change. Enter the exact target email and submit; capture the result, then reload both actors' Dashboard and Danger Zone. The target is the sole A owner and the former owner is Admin, with their original membership IDs and B untouched. An already-open former-owner tab must lose the owner-only action after reload; a stale direct transfer attempt must be denied. Verify exact roles through the owned provider.
5. For a controlled transfer failure, capture the visible error, retain the dialog/retry state, and compare owner rows before another attempt. Retry only after confirming the first transfer did not commit. Mark this failure path unreachable if no owned control can provide a safe failure. Restart the owned worker after successful transfer before later recipes depend on the original roles.

## Gotchas

- Organization membership role and member preset are different fields. Only the owner can change governance role or transfer ownership; normal capability edits do not make a second owner.
- Owner transfer requires an existing eligible member and sensitive-action assurance. If step-up is required, follow the visible verification path and record it; bypassing it does not prove the transfer.
- Member removal is a separate action with a confirmation dialog and ends access while retaining Personnel/Calendar records. Exercise it only with an expendable synthetic member; do not remove the seeded owner, admin or cross-feature fixture.
