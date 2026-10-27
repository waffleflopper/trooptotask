# Create an Organization

A confirmed account without a membership creates an Organization, becomes its owner, and finds the initial configuration
in the new workspace.

## Sub-features

- `creation-gate`: sign-in and confirmed email are required before the form can create a workspace.
- `owner-creation`: one valid submission creates one Organization and its owner membership.
- `initial-configuration`: Groups, Calendar catalogs and holidays, and Personnel ranks are available after creation.
- `creation-retry`: a failed or unconfirmed creation leaves the form and its name in place; submitting that same form
  again finishes with exactly one complete Organization, and a fresh form may still create another.

## How to get to it (user POV)

Sign in as an approved, email-confirmed account without an Organization. On the Organizations list
(`/dashboard?show=all`), choose `Create organization`. The `/org/new` page is the account split shell: the dark panel
reads `Stand up your unit.` with a three-row `What happens next` list from 1024 px (`Name your Organization` tagged
`Now`) and a masthead with `Sign out` and the theme toggle. The form asks for `Organization name` and submits with
`Create and start setup` (`Creating <name>` while pending); `Check your invitations` opens `/dashboard?show=all` and
there is no Cancel. After success the new Organization opens on Setup at `/org/<orgId>/setup/welcome`; the Organizations
list shows it as `Owner`.

## Helper controls

```bash
$V actor orgCreator org/new # confirmed account for creation
$V created-org 'Unique synthetic Organization name' # orgCreator-owned row and default readback
```

`created-org NAME` reads only an Organization with that exact name created by this worker's `orgCreator`, then reports
its owner membership and default Group, Calendar and rank rows. Use a unique name, read count zero before submitting,
and read the same name after the visible creation action. It cannot inspect an arbitrary Organization ID.

The [Organization creation recipe](organization-creation.md#recoverable-creation) owns the creation faults: `org-create`
fails `POST rpc/create_organization` before it reaches the provider and `org-create-lost-ack` forwards that call, lets
it commit and replaces the reply with the same 503 (its receipt adds `providerStatus`). Owner-email and default-row
failures are isolated SQL proof, not browser faults.

## Driving it with verify:app

Preconditions: `doctor` passes on the owned worker; `$V fixture` identifies the synthetic `orgCreator` confirmed account
without membership. Use `$V actor orgCreator dashboard` and its returned page ID.
`$V created-org 'Unique synthetic Organization name'` confines exact row readback to that actor and name.

1. Save an Organizations list snapshot showing `Nothing yet. Create your own to get started.` for `orgCreator`; choose
   `Create organization`. Capture the `/org/new` form, `Organization name`, and enabled `Create and start setup` button.
   A signed-out visit redirects to login. An unconfirmed synthetic account, when available, must see
   `Confirm your email first` naming its address, a disabled field and a disabled submit; record this branch as
   unreachable if that account is absent.
2. Check `$V created-org 'Unique synthetic Organization name'` returns count zero. Try an empty or whitespace-only name
   through the visible form. Expect browser validation, or `Organization name is required` under the field with focus
   back in it, and no new Organization. Fill that unique name and click `Create and start setup`. Expect
   `/org/<orgId>/setup/welcome`, then visit `/dashboard?show=all` and confirm exactly one new row with the same name and
   `Owner` role. Reload both pages for a second read; keep the created ID and canonical URL segment.
3. From the new workspace, open Personnel Group management and rank settings, Calendar status/assignment settings, and
   special days. Record the initial Groups, rank catalog, status and manual assignment types, and federal holidays shown
   there; reload each relevant view. Run `$V created-org 'Unique synthetic Organization name'` again for exact created
   Organization, owner membership and default-row identities/counts. Compare with Organization A/B so creation has not
   added defaults to either existing tenant.
4. Run the [recoverable creation](#recoverable-creation) cases for failed, unconfirmed and retried creation.

## Recoverable creation

Use a unique synthetic name per case and `$V created-org NAME` after every submission. Creation is one
`create_organization` RPC: the Organization, owner membership with the account's email and every default commit together
or not at all, and the form's hidden request id makes a repeat of the same submission return the same Organization.
`$V fault arm NAME` fails that one provider write from the app server: `org-create` before the RPC commits, and
`org-create-lost-ack` after it commits by replacing the reply with a 503. The owner-email and per-default writes happen
inside the RPC, so browser faults cannot reach them; the isolated SQL proof in
`supabase/tests/org_ownership_rpc_contract.sql` injects a failure at the owner membership and at each default table and
shows no Organization, request or row remains, and `supabase/tests/organization_creation_concurrency.sql` proves two
sessions with one request id leave one Organization. Record `$V fault state` (its `matches` and `call`) for every armed
case, then `$V fault restore`. A fault that never matches means its write does not exist; it is not a pass of the case
it names. A complete Organization has one owner membership carrying the creator's email, no Groups, seven status types,
one manual assignment type, four years of federal holidays and the default rank catalog.

- (a) `org-create`, then submit. Expect a visible error that names no provider detail and says retrying is safe, the
  form still showing the name, and `created-org` count zero. Restore and select `Create and start setup` again on the
  same form: one complete Organization opens on Setup.
- (b) `org-create-lost-ack`, then submit. The RPC commits but the reply is lost. Expect the same safe error and form.
  `created-org` shows count one, complete. Restore and submit the same form again: the app opens that same Organization
  and `created-org` still shows count one.
- (c) Owner email and each default. These are not browser faults. Cite the isolated SQL proof for the failure at each
  boundary, and in the browser read the successful Organization's owner membership email and defaults with
  `$V created-org NAME` (case 2 and step 3).
- (d) After any success, open `/org/new` again and create a second Organization with the same name. Both exist; names
  are not unique.
- (e) Reload `/dashboard` after each recovered case: exactly one `Owner` entry per intended Organization.
- Competing submissions of one form are a race the UI cannot make deterministic. Two-session SQL proves that one request
  identity creates one Organization.

## Gotchas

- Account setup and Organization creation are separate. A setup link can activate a User Account without creating
  membership; the creation form requires verified email confirmation.
- Selecting `Create and start setup` again on the same form either finishes creation or opens the Organization that
  already committed. A fresh `/org/new` load gets a new request id, so a deliberate second Organization, even with the
  same name, is separate. A retry that reaches an already committed request opens that Organization under its committed
  name, even if the name was edited before retrying; rename it in Settings.
- Create only in the disposable worker. A successful create changes its seeded state; restart that owned worker before
  another journey needs the original no-Organization actor.
