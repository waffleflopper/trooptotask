# TroopToTask Incident Response Plan

## 1. Identification

Monitor for indicators of compromise:

- Unusual audit log patterns (bulk data access, export spikes, failed auth attempts)
- Supabase dashboard alerts (unusual query patterns, connection spikes)
- Stripe webhook failures or unexpected subscription changes
- User reports of unauthorized access

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

## 3. Notification

- **Within 24 hours:** Notify affected org owners via email
- **Within 72 hours:** Notify all affected users per NIST 800-171 guidelines
- **Include:** What data was exposed, what actions were taken, what users should do

## 4. Eradication

- Identify and patch the vulnerability
- Review audit logs to determine full scope of access
- Remove any unauthorized data or accounts

## 5. Recovery

- Restore from backup if data was modified
- Re-enable affected accounts after password reset
- Deploy patched code
- Verify security headers and rate limiting are active

## 6. Post-Incident Review

- Document timeline, root cause, and impact
- Update security controls based on lessons learned
- File report for compliance records
