# Incident response

Robert owns incidents and coordinates severity, containment, communication and review, or delegates them.

## Severity

| Severity | Examples                                                                                                                    | Response                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Sev 1    | Confirmed unauthorized access to sensitive data, active compromise, destructive data change, exposed production secret      | Immediate containment, notify Robert |
| Sev 2    | Suspected unauthorized access, provider compromise or incident with customer impact, repeated auth anomalies, file concerns | Same business day triage             |
| Sev 3    | Low-impact vulnerability report, unconfirmed suspicious activity, process gap                                               | Review within 2 business days        |

## Reviews

Robert reviews this runbook quarterly and after material auth, Storage or admin changes. He reviews audit logs for authentication, permission, export, admin and unusual access events monthly during launch, and after an incident or suspicious report. Review outcomes stay outside the repository.

## Identification

Watch for unusual audit log patterns (bulk reads, export spikes, failed sign-ins), Supabase dashboard alerts and user reports. Record the date, reporter, affected Organization and initial severity.

## Containment

1. Disable affected user accounts in Supabase Auth.
2. Rotate the Supabase service role key, the Resend API key and `CLEANUP_SECRET`/`CRON_SECRET`.
3. Revoke active sessions through the Supabase Auth admin API.
4. For an Organization-specific incident, a platform admin suspends the Organization in the app.

Record an owner and a timestamp for each step. If containment seems to need a production data change, stop and get Robert's explicit approval.

## Communication

- Notify affected Organization owners within 24 hours of a confirmed high-impact incident. Say what data was exposed, what was done and what users should do.
- Notify affected users within 72 hours when notification is warranted.
- Acknowledge reports to `security@trooptotask.org` within 48 hours.

## Eradication and recovery

- Patch the vulnerability and review audit logs for the full scope of access.
- Remove unauthorized data or accounts.
- Restore from backup only after Robert approves the path in [backup and restore](backup-restore.md).
- Re-enable accounts after password reset, deploy the fix, and confirm security headers and rate limits are active.

## Review

Record the timeline, root cause, impact, whether credentials were rotated and the follow-up tasks. Rotation records name the credential type, environment, owner, time and validation, never the value.

Keep incident records, provider tickets, customer messages and screenshots outside the repository.
