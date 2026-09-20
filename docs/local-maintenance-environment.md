# Independent local v1 maintenance

This setup branch separates ongoing v1 work from the frozen v2 comparison checkout.
The owner authorized the local setup on September 16, 2026. Its acceptance is an
independent runnable clone/database, preserved reference source/data, and repeatable
startup and synthetic-fixture instructions.

Use Supabase project `trooptotask-v1-maintenance` on ports 56320–56329, with edge
inspector 8283. The normal app uses localhost:5173. The frozen reference retains project `trooptotask` on 543xx and app 127.0.0.1:4173.

`supabase/config.toml` disables the legacy dump seed for new maintenance databases.
Use deliberately synthetic fixtures. The browser harness, its account/seed creation
and direct psql cleanup code have been removed. Verification uses the disposable
environment in [Local Auth Testing](local-auth-testing.md); this maintenance stack
and its existing data are not verification targets.

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

The app and retained tests no longer use commercial flags or payment-provider credentials.
Ignored environment files and workstation launchers require the owner-operated cleanup
in [the release runbook](stabilization/RELEASE.md#commercial-operations-retirement--03-07b-01);
repository changes do not establish that those external settings have been retired.
Preview origins and setup secrets belong to the isolated preview environment.
App-owned email uses its real transport; no runtime test-email bypass remains.

The date-sensitive invitation tests described in the initial setup audit were
fixed by [stabilization task 02-01](stabilization/EVIDENCE.md#task-02-01-deterministic-invitation-expiry).
The retained suite no longer requires a shifted system clock.
