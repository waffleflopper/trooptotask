# D03 PR handoff

**Prepared title:** `[V1 stabilization][05][D03] Remove remaining Duty Roster integration consumers`

**Repository/base/head:** `waffleflopper/trooptotask`, base `main` at `2f65b2f449f1bf782efccc2c8135b44be5976732`, local head branch `stabilization/05-d03-integration-consumers` at `0b0d1b9016bb8b8a4f121514f9ea23e16ec3498e` plus the uncommitted 05-04-06c documentation and handoff diff. No D03 PR or remote head exists yet. Verify the final committed/published head and PR base against live GitHub before review; this local SHA is not a future PR SHA.

## Prepared PR body

```markdown
## Scope

- Remove Duty Roster metadata and runtime reads from rank summaries, availability statuses and Personnel readiness, Dashboard setup and platform activation health, archive retention, and Organization JSON/Excel exports.
- Remove remaining public and account-facing Duty Roster promotion, retired route reservation, and obsolete current guidance. Keep historical What's New entries accurate; the latest entry says Duty Rosters will return in a future update without promising a date.
- Keep Personnel Duty Role, independent Sign-In Rosters, ordinary Calendar status and assignment workflows, saved historical Calendar assignments and types, rank protection, and Organization/Group isolation.
- Add the `20260922000300` archive-retention guard migration. It atomically protects saved Calendar assignment types during cleanup. Phase 06 still owns duty-only schema retirement and stored-provenance disposition.

## Verification

- Full format, lint, governance, Svelte/type, retained Vitest and production build sequence: see the final task 05-04-06c record in `docs/stabilization/EVIDENCE.md` for exact results.
- Disposable fresh and upgrade migration replay plus SQL/RLS contracts for the new guard passed in task 05-04-04; synthetic person/Group assignments and types survived concurrent cleanup.
- Production-mode local browser/API evidence covers rank and status settings, Dashboard and activation health, archive cron, JSON/Excel exports, public landing, member removal, Organization slug, and What's New. See the per-leaf records in `docs/stabilization/EVIDENCE.md`.
- Independent full-diff review and remaining application/SQL-call inventory are recorded in task 05-04-06c. Hosted GitHub Actions is disabled/unavailable, not a passing check.

## Release ordering and review

Before any publication that deploys this app, verify preview/production targets and triggers, arrange final-scope notice and caller cutover, backups/recovery, and app/schema compatibility. Separately apply and verify migration `20260922000300` and its service-role execute grant before the new archive job or cron runs. Old app/new schema is compatible; new archive job/old schema is not. No remote database operation is part of this PR handoff.

Review the exact published head for retained Calendar data/authorization and the archive-retention migration. Confirm deployment and required status/review evidence on the PR before merge. Phase parent: #1278.

Closes #1318
```

**Owner action:** review the full local `main...stabilization/05-d03-integration-consumers` diff and the final 05-04-06c record, then separately authorize commit/publication and creation of the D03 PR with the prepared body. Push may deploy a preview, and merge may release to production; external deployment settings and hosted migration state remain unverified. Keep #1318 open until verified merge. Do not start #1319 from an unpublished or open D03 PR.
