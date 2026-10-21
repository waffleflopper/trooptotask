# Provisioning and deprovisioning

Robert approves each access change and sweeps for stale access monthly during launch.

## Granting access

1. Confirm the business need, role, environment and approver.
2. Grant the least privileged role. Prefer time-bounded access for support and incident work.
3. Limit support access to the affected Organization's admin diagnostics, and to provider logs only when the case needs them.
4. Record the approver, date, role and review date outside the repository.

## Removing access

Remove access when a person leaves, changes role, no longer needs it, fails [access review](access-review.md) or is involved in a suspected compromise.

1. Revoke app, provider and repository access that is no longer needed.
2. Remove or downgrade Organization owner and admin roles where appropriate.
3. Revoke active sessions when compromise, departure or a role change warrants it.
4. Rotate shared or exposed credentials.
5. Record the date, systems and outcome outside the repository.

Organization owner and admin changes need a request from an authorized owner or approved representative. If a data correction seems necessary, stop and ask Robert before touching any database.

## Secrets review

Before release and after any provider, staff, incident or secret change, confirm each deployment variable exists in the right environment and has an owner and rotation path. Record existence, owner and review date only.

## Support notes

Account and Organization support uses `support@trooptotask.org`. Privacy requests use `privacy@trooptotask.org`. Correlate cases with Organization ID, user ID and audit-log ID. Support notes never contain invite or recovery links, passwords, API keys, session cookies, raw provider payloads or raw roster exports.
