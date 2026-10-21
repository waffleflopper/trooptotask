# Access review

Robert runs this review monthly during launch, then quarterly. Run it again after a material change to auth, Storage, providers or platform admin.

## Scope

- Platform admins and anyone with provider dashboard access.
- Organization owners and admins.
- Support admins who can reach Organization diagnostics or provider logs.
- Stale users: departed personnel, dormant invites and accounts with no recent legitimate use.

## Procedure

1. Record the reviewer, date, environment and systems reviewed.
2. Inspect access lists in the app and each provider.
3. Confirm each platform admin and support admin still has a business need.
4. Confirm each Organization owner and admin with the Organization owner or an approved representative.
5. Flag stale users, dormant invites and unexpected privilege.
6. For each exception, record the owner, the reason access remains and a target date.
7. Remove or downgrade access through [provisioning and deprovisioning](provisioning-deprovisioning.md).
8. Keep the evidence outside the repository.

Evidence never contains passwords, API keys, recovery links, session cookies, raw provider exports or screenshots that expose secrets.
