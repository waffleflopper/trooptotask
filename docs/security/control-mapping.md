# TroopToTask Security Control Mapping

This document is the repo-facing summary of where the current security remediation work stands. It is intentionally pragmatic and should be updated as implementation changes land.

## Implemented

- **Server-side session boundary**
  Root layout data no longer serializes auth cookies or a broad browser Supabase client. Auth cookies are written server-side with `HttpOnly` handling in `src/hooks.server.ts`.
- **Absolute session limit**
  The app enforces a 24-hour absolute session window in `src/hooks.server.ts`, and the local Supabase config mirrors that baseline in `supabase/config.toml`.
- **Least-privilege RLS for core data**
  Core personnel, calendar, and training tables are tightened in the consolidated Supabase migrations, with regression coverage in `src/lib/server/rlsPermissionHardening.test.ts`.
- **Scoped personnel bootstrap hardening**
  Scoped users no longer receive a full-org personnel dataset through the workspace bootstrap path; they now get a narrower `personnelLookup` projection.
- **Sensitive storage authorization**
  Sensitive file access is mediated through app endpoints and versioned storage policies in the consolidated Supabase migrations.
- **Audit-log minimization**
  Audit writes are centrally sanitized in `src/lib/server/auditLog.ts`, and higher-value callers now emit normalized subject/reviewer fields.
- **Public and internal security copy alignment**
  `/security`, `docs/security/security-overview.md`, and `supabase/config.toml` now reflect the implemented retention, session, and auth baseline.

## Partial

- **Hosted auth rollout flags**
  Local config documents the intended baseline, but production rollout for email confirmation and TOTP MFA is still environment-managed and may not match local defaults at every moment.
- **NIST 800-171 alignment evidence**
  The codebase now supports the core technical claims much better, and `docs/security/operational-control-evidence.md` indexes the launch operational runbooks. Recurring review artifacts, provider dashboard evidence, incident records, and restore-drill evidence still live outside the repo with Robert, so this remains partial.
- **Operational control evidence pack**
  `docs/security/operational-control-evidence.md` links the launch runbooks for incident response, access review, provisioning/deprovisioning, backup/restore, billing/support security, vulnerability disclosure, audit-log review, and environment/secrets review. Some rows remain partial or planned where evidence is external or not yet exercised.

## Planned

- **Restore drill evidence**
  `docs/security/backup-restore.md` documents the restore request path and explicitly states that a full restore drill has not yet been recorded in the repo. Do not upgrade this status until Robert runs and records a non-production drill or approved provider restore exercise.
- **Ongoing control-map maintenance**
  Keep this document updated as security-relevant architecture changes land so repo reviewers are not forced to infer posture from scattered issues and code comments.
