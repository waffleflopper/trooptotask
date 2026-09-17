# Independent local v1 maintenance

This setup branch separates ongoing v1 work from the frozen v2 comparison checkout.
The owner authorized the local setup on September 16, 2026. Its acceptance is an
independent runnable clone/database, preserved reference source/data, and repeatable
startup and synthetic-fixture instructions.

Use Supabase project `trooptotask-v1-maintenance` on ports 56320–56329, with edge
inspector 8283. The normal app uses localhost:5173; E2E uses 127.0.0.1:4273. The
frozen reference retains project `trooptotask` on 543xx and app 127.0.0.1:4173.

`supabase/config.toml` disables the legacy dump seed for new maintenance databases.
Use deliberately synthetic fixtures. Browser-test defaults and the direct psql
cleanup target this stack, with `E2E_DATABASE_URL` allowing an explicit test database.
Existing fixture cleanup is not run as part of initial setup.

On Robert's workstation, use `trooptotask-local maintenance check`, `db-start`,
`status`, or `app`. Full instructions and private credential locations are in
`~/Projects/TROOPTOTASK-ENVIRONMENTS.md`. The launcher rejects a different project
or port configuration. Carry these settings when starting a new maintenance branch.

The local setup does not deploy, modify the production database, copy production
credentials, or grant permission to reset existing databases. Reference application
source and approved v2 evidence remain pinned to the original baseline.

## Verification and inherited limitation

Formatting, ESLint, governance and Svelte/type checks pass. Browser smoke checks
verified both synthetic rosters and independent concurrent sessions with all
external browser requests blocked. Reference source/overlay hashes, local Git
guards, baseline bundle and independent Docker database volumes were checked.

The unit-test environment uses an ignored `.env.test.local` with
`PUBLIC_BILLING_ENABLED=true` to exercise existing v1 billing components; both
manual preview launchers keep billing disabled and have no Stripe credentials.
Browser-only origin, test-email and setup-secret values live in the launcher
environment, avoiding contamination of unit tests.

Three existing invitation tests in
`src/routes/org/[orgId]/settings/members/membersSettings.server.test.ts` fail on the
current date. The fixture expires August 15, 2026; its loader tests omit the fixed
August 4 clock used elsewhere in that file. The same unchanged 28 tests pass under
a temporary August 4 clock. The diagnosis did not alter product/test source or the
normal suite clock. Stabilizing those tests is deferred; the ordinary full suite
and existing pre-push gate remain failing until that separate test fix is made.
