# ADR 0009: Access Requests and Account Setup Links

## Decision

- Supabase Auth stays the authentication provider. TroopToTask does not use Supabase invite emails for account setup. It issues its own **Account Setup Links**.
- Public `/auth/sign-up` redirects to `/auth/request-access`. Platform entry is a reviewed **Access Request**.
- Approving an **Access Request** issues a setup link. It does not create a Supabase **User Account**.
- The database stores only the SHA-256 hash of a setup token. The raw token appears only in the emailed URL and cannot be recovered.
- An **Access Request** has at most one pending setup link: unclaimed, unused, unfailed and unrevoked. Issuing a new link revokes older unclaimed links. A claimed link can coexist with a fresh one.
- A setup link expires after 14 days. An approved request can receive fresh links for 90 days unless it is closed. [ADR 0012](0012-organization-invited-platform-access-auto-approval.md) defines when an invitation-origin approval stops issuing links.
- The recipient chooses their own password. Only then does TroopToTask create the **User Account**, with the email already confirmed, because the link proves control of the address.
- If a **User Account** already exists for the email, completing setup activates it and replaces its password. Treat the setup page as a credential reset for that email.
- Completing setup creates a **User Account** only. It never creates an **Organization Member**. **Organization Invitation** acceptance is a separate workflow.
- `/auth/renew-invite` sends a fresh link. `/auth/request-access` sends a fresh link instead of a duplicate request when the email already has an approved incomplete request.
- Cleanup may revoke stale unclaimed links. It never deletes **Access Requests** or **User Accounts** by default.

## Why

Supabase invite links expire after 24 hours. Many recipients use military email they check only during the duty week, so weekend approvals expired before anyone opened them. Emailing temporary passwords is worse credential handling. Creating accounts at approval time would force risky account deletion for unclaimed invites.

## Held claims

The one-active-link rule covers one **Access Request**, not password writes for one email. A claimed link can coexist with a fresh link, and two approved requests can share a normalized email. So completing a link first takes an email-scoped claim in the database, before any Supabase Auth write. While any earlier claim for that email is unresolved, no other link for the email can start a password write. A fresh link does not release a held claim.

Each claim carries an attempt ID, written in the claim transaction. The Auth create or password update carries that ID in a metadata marker. A database trigger witnesses the committed Auth write and removes the marker. Reconciling a still-started attempt fences the marker before another password write can begin. A provider response or elapsed time is never proof of a write or a rollback.

- If the witness committed, a valid link for an approved request at the same email finishes identity, profile, request and link tracking without a new password.
- A witnessed no-write is fenced, and a fresh valid link can then set a password. Reconciliation consumes the fenced source link.
- The browser receives progress and guidance only. It never receives the witness, the provider identity or staff-release authority.

The database forbids changing the email of an approved request or of any request with an issued link, so a pending Auth write cannot leave its email-scoped hold. Correcting such an address needs a new request.

Claims without an attempt ID, inconsistent records and failed reconciliation need staff. Follow [Account Setup claim recovery](../../operations/account-setup-claim-recovery.md).

## Constraints

- Do not email temporary passwords.
- Do not create a **User Account** before a valid link is used and a password is chosen.
- Do not treat an **Access Request** as an **Organization Invitation**.
- Hashing, single active link, expiry and identity-after-password apply to every issuer.
