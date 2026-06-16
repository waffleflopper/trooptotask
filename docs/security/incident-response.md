# TroopToTask Incident Response Plan

This runbook is launch posture, not a certification claim. Capture evidence without copying secrets, raw webhook payloads, card details, session cookies, customer exports, or unnecessary incident detail into the repo.

## Roles

- **Incident owner:** Robert or a delegated launch operator who coordinates severity, containment, communication, and post-incident review.
- **Technical responder:** the person investigating app, provider, auth, storage, billing, or deployment behavior.
- **Communications owner:** Robert or a delegated support owner who prepares Organization-owner and user updates.
- **Evidence owner:** Robert, responsible for storing sanitized evidence externally and keeping repo notes free of secrets.

## Severity

| Severity | Examples | Target response |
| --- | --- | --- |
| Sev 1 | Confirmed unauthorized access to CUI-equivalent data, active compromise, destructive data modification, exposed production secret, or payment-impacting security incident | Immediate containment and Robert notification |
| Sev 2 | Suspected unauthorized access, scoped provider compromise, webhook/payment incident with customer impact, repeated failed auth anomalies, or sensitive file access concern | Same business day triage and containment decision |
| Sev 3 | Low-impact vulnerability report, suspicious but unconfirmed activity, support-safe billing issue, or documentation/process gap | Review within 2 business days |

## 1. Identification

Monitor for indicators of compromise:

- Unusual audit log patterns (bulk data access, export spikes, failed auth attempts)
- Supabase dashboard alerts (unusual query patterns, connection spikes)
- Stripe webhook failures or unexpected subscription changes
- User reports of unauthorized access

Record the date, reporter, affected Organization if known, support-safe identifiers, and initial severity. Do not paste secret values, raw provider payloads, or screenshots containing sensitive values into repo docs, issues, or pull requests.

## 2. Containment

Immediate actions upon confirmed breach:

1. **Disable affected user accounts** via Supabase Auth dashboard
2. **Rotate credentials:**
   - Supabase service role key
   - Stripe API keys and webhook secret
   - Resend API key
   - CLEANUP_SECRET / CRON_SECRET
3. **Revoke all active sessions** via Supabase Auth admin API
4. **If org-specific:** set org to read-only via database

Containment actions require an owner and timestamp in the external evidence record. Do not run destructive database actions or production restore actions from an agent session. If a containment step appears to require production data changes, stop and get Robert's explicit approval.

## 3. Communications

- **Within 24 hours for confirmed high-impact incidents:** notify affected Organization owners with a plain-language summary, known data categories, containment actions, and next steps.
- **Within 72 hours when user notification is warranted:** notify affected users according to Robert's legal, contractual, and policy obligations.
- **Security reports:** acknowledge responsible disclosure reports within 48 hours and provide a resolution timeline within 5 business days when possible.
- **Billing/payment incidents:** communicate whether service access, billing status, invoices, or payment recovery is affected without asking customers for card details or secret-bearing screenshots.

Communications evidence should be stored externally. Repo notes may reference the artifact type and date only.

## 4. Credential Rotation

Rotate credentials when a secret is exposed, a provider account is compromised, staff with shared access departs, or there is credible evidence of unauthorized use.

Rotation evidence should record:

- credential type, not the value;
- affected environment;
- rotation owner;
- time rotated;
- validation performed;
- follow-up access review.

Never paste old or new secret values into notes, tickets, docs, pull requests, screenshots, or chat transcripts.

## 5. Billing Webhook And Payment Incidents

Treat billing and payment incidents as security-relevant when they involve webhook authenticity, unauthorized Stripe Dashboard access, unexpected subscription state changes, invoice/payment manipulation, or customer-impacting access changes.

Preserve support-safe identifiers:

- Stripe customer ID,
- subscription ID,
- invoice ID,
- webhook event ID,
- TroopToTask Organization ID,
- billing snapshot or reconciliation reference.

Do not store raw webhook payloads, webhook signatures, card details, API keys, or customer payment method data in repo docs or support notes.

## 6. Evidence Handling

Use external evidence held by Robert for:

- incident timeline,
- provider tickets,
- customer communications,
- dashboard screenshots,
- access-review exports,
- billing event details,
- post-incident review notes.

Repo updates should contain only sanitized summaries, runbook changes, and follow-up action references.

## 7. Notification

- **Within 24 hours:** Notify affected org owners via email
- **Within 72 hours:** Notify all affected users per NIST 800-171 guidelines
- **Include:** What data was exposed, what actions were taken, what users should do

## 8. Eradication

- Identify and patch the vulnerability
- Review audit logs to determine full scope of access
- Remove any unauthorized data or accounts

## 9. Recovery

- Restore from backup only after Robert approves the recovery path and the backup/restore runbook has been consulted
- Re-enable affected accounts after password reset
- Deploy patched code
- Verify security headers and rate limiting are active

Do not claim a restore drill passed unless Robert has actually run and recorded one. Prefer non-production validation before any production-impacting action.

## 10. Post-Incident Review

- Document timeline, root cause, and impact
- Update security controls based on lessons learned
- File report for compliance records

The post-incident review should include owner, cadence impact, evidence location, customer-impact summary, whether credential rotation was required, whether billing/support processes were involved, and follow-up tasks.
