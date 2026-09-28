# Create an Organization

A confirmed account without a membership creates an Organization, becomes its owner, and finds the initial configuration in the new workspace.

## Sub-features

- `creation-gate`: sign-in and confirmed email are required before the form can create a workspace.
- `owner-creation`: one valid submission creates one Organization and its owner membership.
- `initial-configuration`: Groups, Calendar catalogs and holidays, and Personnel ranks are available after creation.
- `creation-retry`: a pre-RPC denial leaves no Organization; after an uncertain or post-RPC result, read back creation and seeds before any retry.

## How to get to it (user POV)

Sign in as an approved, email-confirmed account without an Organization. On `/dashboard`, choose `Create Organization`. The `/org/new` form asks for `Organization Name` and submits with `Create Organization`. After success, the new Organization opens at `/org/<orgId>`; the Dashboard lists it as `Owner`.

## Driving it with verify:app

Preconditions: `doctor` passes on the owned worker; `$V fixture` identifies the synthetic `orgCreator` confirmed account without membership. Use `$V actor orgCreator dashboard` and its returned page ID. Record the candidate digest, origin, role, and Organization IDs. `$V created-org 'Unique synthetic Organization name'` confines exact row readback to that actor and name.

1. Save a Dashboard snapshot showing no membership for `orgCreator`; choose `Create Organization` from a fresh snapshot. Capture the `/org/new` form, `Organization Name`, and enabled `Create Organization` button. A signed-out visit redirects to login. An unconfirmed synthetic account, when available, must see `Confirm your email first` and a disabled submit; record this branch as unreachable if that account is absent.
2. Check `$V created-org 'Unique synthetic Organization name'` returns count zero. Try an empty or whitespace-only name through the visible form. Expect browser validation or a visible action error, with no new Organization. Fill that unique name and click `Create Organization`. Capture before/action/after snapshots and a screenshot. Expect the new Organization route and owner dashboard, then visit `/dashboard` and confirm exactly one new workspace with the same name and `Owner` label. Reload both pages for a second read; keep the created ID and canonical URL segment.
3. From the new workspace, open Personnel Group management and rank settings, Calendar status/assignment settings, and special days. Record the initial Groups, rank catalog, status and manual assignment types, and federal holidays shown there; reload each relevant view. Run `$V created-org 'Unique synthetic Organization name'` again for exact created Organization, owner membership and default-row identities/counts. Compare with Organization A/B so creation has not added defaults to either existing tenant.
4. Exercise a scoped creation failure only when an owned control can fail the creation request before the owner RPC. Capture its HTTP status, visible error, and no new Organization/member rows; restore the control and retry once with a new unique name. If the failure occurs after the RPC, record the new Organization and partial seeds separately: the seed steps are outside the owner transaction, so do not infer rollback or retry safety from the error screen. Mark this branch unreachable when no safe failure control exists.

## Gotchas

- Account setup and Organization creation are separate. A setup link can activate a User Account without creating membership; the creation form requires verified email confirmation.
- The owner RPC is atomic for Organization plus owner membership. Owner-email and default seeding happen afterward and must be observed separately. A failed rank seed may return an error after the Organization already exists. Automatic recovery/idempotency for that partial state remains F06 / 11-03 work.
- Create only in the disposable worker. A successful create changes its seeded state; restart that owned worker before another journey needs the original no-Organization actor.
