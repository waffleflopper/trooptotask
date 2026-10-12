# Create an Organization

A confirmed account without a membership creates an Organization, becomes its owner, and finds the initial configuration in the new workspace.

## Sub-features

- `creation-gate`: sign-in and confirmed email are required before the form can create a workspace.
- `owner-creation`: one valid submission creates one Organization and its owner membership.
- `initial-configuration`: Groups, Calendar catalogs and holidays, and Personnel ranks are available after creation.
- `creation-retry`: a failed or unconfirmed creation leaves the form and its name in place; submitting that same form again finishes with exactly one complete Organization, and a fresh form may still create another.

## How to get to it (user POV)

Sign in as an approved, email-confirmed account without an Organization. On `/dashboard`, choose `Create Organization`. The `/org/new` form asks for `Organization Name` and submits with `Create Organization`. After success, the new Organization opens at `/org/<orgId>`; the Dashboard lists it as `Owner`.

## Driving it with verify:app

Preconditions: `doctor` passes on the owned worker; `$V fixture` identifies the synthetic `orgCreator` confirmed account without membership. Use `$V actor orgCreator dashboard` and its returned page ID. Record the candidate digest, origin, role, and Organization IDs. `$V created-org 'Unique synthetic Organization name'` confines exact row readback to that actor and name.

1. Save a Dashboard snapshot showing no membership for `orgCreator`; choose `Create Organization` from a fresh snapshot. Capture the `/org/new` form, `Organization Name`, and enabled `Create Organization` button. A signed-out visit redirects to login. An unconfirmed synthetic account, when available, must see `Confirm your email first` and a disabled submit; record this branch as unreachable if that account is absent.
2. Check `$V created-org 'Unique synthetic Organization name'` returns count zero. Try an empty or whitespace-only name through the visible form. Expect browser validation or a visible action error, with no new Organization. Fill that unique name and click `Create Organization`. Capture before/action/after snapshots and a screenshot. Expect the new Organization route and owner dashboard, then visit `/dashboard` and confirm exactly one new workspace with the same name and `Owner` label. Reload both pages for a second read; keep the created ID and canonical URL segment.
3. From the new workspace, open Personnel Group management and rank settings, Calendar status/assignment settings, and special days. Record the initial Groups, rank catalog, status and manual assignment types, and federal holidays shown there; reload each relevant view. Run `$V created-org 'Unique synthetic Organization name'` again for exact created Organization, owner membership and default-row identities/counts. Compare with Organization A/B so creation has not added defaults to either existing tenant.
4. Run the [F06 recoverable creation](#f06-recoverable-creation-11-03) cases for failed, unconfirmed and retried creation.

## F06 recoverable creation (11-03)

These cases state the intended behavior of issue #1640; its acceptance record holds the pre-repair baseline. Use a unique synthetic name per case and `$V created-org NAME` after every submission. `$V fault arm NAME` fails one provider write from the app server: `org-create` before the creation RPC commits, `org-create-lost-ack` after it commits by replacing the reply with a 503, and `org-owner-email`, `org-groups`, `org-status-types`, `org-assignment-types`, `org-holidays` and `org-ranks` at each post-creation write. Record `$V fault state` (its `matches` and `call`) for every armed case, then `$V fault restore`. A fault that never matches is evidence that its write no longer exists, not a pass of the case it names. A complete Organization has one owner membership carrying the creator's email, three Groups, seven status types, one manual assignment type, four years of federal holidays and the default rank catalog.

- (a) `org-create`, then submit. Expect a visible error that names no provider detail and says retrying is safe, the form still showing the name, and `created-org` count zero. Restore and select `Create Organization` again on the same form: one complete Organization opens.
- (b) `org-create-lost-ack`, then submit. The RPC commits but the reply is lost. Expect the same safe error and form. `created-org` shows count one, complete. Restore and submit the same form again: the app opens that same Organization and `created-org` still shows count one.
- (c) Each post-creation write fault in turn. Expect no Organization reported as created while its owner email or any default is missing: either one complete Organization or the safe error with nothing partial, and retry of the same form converges to one complete Organization.
- (d) After any success, open `/org/new` again and create a second Organization with the same name. Both exist; names are not unique.
- (e) Reload `/dashboard` after each recovered case: exactly one `Owner` entry per intended Organization.
- Competing submissions of one form are a race the UI cannot make deterministic. Two-session SQL proves that one request identity creates one Organization.

## Gotchas

- Account setup and Organization creation are separate. A setup link can activate a User Account without creating membership; the creation form requires verified email confirmation.
- The owner RPC is atomic for Organization plus owner membership. Owner-email and default seeding happen afterward and must be observed separately. A failed rank seed may return an error after the Organization already exists. Automatic recovery/idempotency for that partial state remains F06 / 11-03 work.
- Create only in the disposable worker. A successful create changes its seeded state; restart that owned worker before another journey needs the original no-Organization actor.
