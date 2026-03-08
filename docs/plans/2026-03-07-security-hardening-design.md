# Security Hardening & NIST 800-171 Compliance Design

**Date:** 2026-03-07
**Status:** Draft
**Goal:** Harden TroopToTask against OWASP Top 10 vulnerabilities and align with NIST SP 800-171 controls for protecting CUI (personnel names, contact info, emergency contacts, counseling notes, training records).

---

## Audit Summary

**Current strengths:**
- RLS enabled on all 28 tables with org-isolation policies
- Zero raw SQL — all queries parameterized via Supabase client
- No eval(), no innerHTML, no dangerous {@html} with user data
- Cookies configured with httpOnly, sameSite, secure
- File uploads validated (type, size, filename sanitization)
- Dual-key protection on mutations (id + organization_id)

**Gaps identified:**
- No security response headers (CSP, X-Frame-Options, etc.)
- No API-wide rate limiting
- Some form actions rely solely on RLS without server-side permission checks
- No audit logging for sensitive data access or admin actions
- No session timeout/re-authentication policies
- No compliance marketing on public pages

---

## Phase 1 — Immediate Security Hardening

### 1.1 Security Response Headers

**File:** `src/hooks.server.ts` (add to `handle` function)

Add these headers to every response:

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; frame-src https://js.stripe.com; connect-src 'self' https://*.supabase.co; img-src 'self' data: blob:; font-src 'self'` | Prevents XSS, injection |
| X-Frame-Options | `DENY` | Prevents clickjacking |
| X-Content-Type-Options | `nosniff` | Prevents MIME sniffing |
| Referrer-Policy | `strict-origin-when-cross-origin` | Limits referrer leakage |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | Disables unused browser APIs |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Forces HTTPS |
| X-DNS-Prefetch-Control | `off` | Prevents DNS prefetch leakage |

**Implementation:** Add a `handleSecurityHeaders` function in hooks.server.ts that sets these on every response via `resolve(event, { transformPageChunk })` or by modifying the response directly.

### 1.2 Rate Limiting

**New file:** `src/lib/server/rateLimit.ts`

In-memory sliding-window rate limiter keyed by IP + route pattern.

```typescript
interface RateLimitConfig {
  windowMs: number;    // time window
  maxRequests: number; // max requests per window
}
```

**Default limits:**
| Route Pattern | Window | Max | Rationale |
|---------------|--------|-----|-----------|
| `/auth/*` | 15 min | 10 | Prevent brute force login |
| `/api/access-requests` | 1 hour | 5 | Prevent abuse of public endpoint |
| `/api/create-demo-sandbox` | 1 hour | 3 | Prevent demo abuse |
| `/org/*/api/*` (writes) | 1 min | 30 | Prevent bulk data scraping/mutation |
| `/org/*/api/export*` | 1 hour | 10 | Already tier-gated, add IP limit |
| All other routes | 1 min | 60 | General protection |

**Implementation:** Call rate limiter in `hooks.server.ts` handle function, before route resolution. Return 429 with `Retry-After` header when exceeded.

**Note on serverless:** Vercel serverless functions don't share memory across invocations reliably. For launch, in-memory is acceptable (each instance rate-limits independently). If abuse is observed, upgrade to Vercel KV or Supabase-backed counters.

### 1.3 Server-Side Permission Checks on Form Actions

**File:** `src/routes/org/[orgId]/settings/+page.server.ts`

These form actions currently rely only on RLS. Add explicit server-side checks:

| Action | Current Check | Add |
|--------|--------------|-----|
| `updateName` | RLS only | `requireEditPermission(supabase, orgId, userId, 'canManageMembers')` |
| `invite` | RLS only | Verify user is owner or has `canManageMembers` |
| `revokeInvite` | RLS only | Verify user is owner or has `canManageMembers` |
| `transferOwnership` | RPC handles it | Add explicit owner check before RPC call |

**Principle:** Defense-in-depth. RLS is the last line, not the only line.

### 1.4 Input Validation Hardening

**New file:** `src/lib/server/validation.ts`

Centralized validation utilities:

```typescript
// String sanitization — trim + collapse whitespace + length cap
export function sanitizeString(input: string, maxLength: number = 255): string

// Email validation — stricter than current regex
export function validateEmail(email: string): boolean

// UUID validation — prevent injection via route params
export function validateUUID(id: string): boolean

// Enum validation — restrict to allowed values
export function validateEnum<T>(value: string, allowed: T[]): T | null
```

**Apply to:**
- All form action inputs (settings, auth, feedback)
- All API route body parsing (personnel, training, counseling)
- Route params (orgId, personnelId) — validate as UUID before use

### 1.5 Supabase Storage Bucket Policies

**New migration file:** Add explicit RLS policies for the `counseling-files` storage bucket.

```sql
-- Only org members can read files in their org's folder
CREATE POLICY "Org members can read own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'counseling-files'
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

-- Only personnel editors can upload/delete files
CREATE POLICY "Personnel editors can write files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'counseling-files'
  AND can_edit_personnel((storage.foldername(name))[1]::uuid)
);
```

---

## Phase 2 — NIST 800-171 Compliance Controls

Reference: NIST SP 800-171 Rev 2 control families relevant to this application.

### 2.1 Audit & Accountability (3.3)

**New file:** `src/lib/server/auditLog.ts`

Log security-relevant events to a new `audit_logs` table:

```sql
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  org_id uuid REFERENCES organizations(id),
  action text NOT NULL,           -- 'personnel.view', 'export.create', 'member.invite', etc.
  resource_type text NOT NULL,    -- 'personnel', 'counseling_record', 'organization', etc.
  resource_id uuid,
  ip_address inet,
  user_agent text,
  details jsonb,                  -- additional context (field changes, etc.)
  severity text NOT NULL DEFAULT 'info'  -- 'info', 'warning', 'critical'
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only platform admins and org owners can read audit logs
CREATE POLICY "Org owners can read own audit logs"
ON audit_logs FOR SELECT
USING (is_org_owner(org_id) OR is_platform_admin());

-- No user can modify audit logs (append-only via service role)
-- INSERT via service role only (no user INSERT policy)
```

**Events to log:**

| Event | Severity | Trigger |
|-------|----------|---------|
| Login success/failure | info/warning | Auth callback |
| Personnel record viewed | info | GET personnel-extended-info |
| Personnel record created/updated/deleted | info | Personnel API mutations |
| Counseling record created/updated/deleted | info | Counseling API mutations |
| Data export initiated | info | Export endpoints |
| Member invited/removed | info | Settings actions |
| Permissions changed | warning | Settings updatePermissions |
| Ownership transferred | critical | Settings transferOwnership |
| Organization deleted | critical | Settings deleteOrganization |
| Failed authorization attempt | warning | Permission check failures |
| Rate limit exceeded | warning | Rate limiter |
| Admin action (gifting, etc.) | critical | Admin routes |

**Implementation:** `auditLog(event, locals)` helper called from API routes and form actions. Uses service role client to INSERT (bypasses RLS for append-only writes).

### 2.2 Access Control (3.1)

**Session management enhancements:**

| Control | Implementation |
|---------|---------------|
| Session timeout | Add `maxAge` to Supabase auth config — 8-hour idle timeout, 24-hour absolute timeout |
| Re-authentication for sensitive ops | Require password confirmation before: ownership transfer, org deletion, export of all data |
| Login attempt lockout | After 5 failed attempts in 15 min, lock account for 30 min (tracked in rate limiter) |

**File:** Update Supabase auth config and add re-auth modal component.

### 2.3 Identification & Authentication (3.5)

| Control | Current | Target |
|---------|---------|--------|
| Unique user IDs | Supabase auth.uid() | Already compliant |
| Password complexity | 6-char minimum | 12-char minimum, require mixed case + number |
| MFA | Not available | Add TOTP MFA via Supabase Auth (optional for users, can be org-enforced later) |

**Implementation:**
- Update registration validation to enforce new password policy
- Add MFA enrollment flow using Supabase's built-in TOTP support
- Add MFA verification to login flow

### 2.4 System & Communications Protection (3.13)

| Control | Status | Notes |
|---------|--------|-------|
| Encryption in transit | TLS via Vercel + Supabase | Already compliant |
| Encryption at rest | Supabase encrypts at rest by default | Already compliant |
| Boundary protection | Security headers (Phase 1) | Phase 1 covers this |

No additional work needed — Supabase + Vercel provide these by default.

### 2.5 Data Minimization

**API response filtering for sensitive endpoints:**

Add a `sanitizeResponse` layer to personnel-extended-info that strips fields based on the requester's permission level:

| Permission | Fields Returned |
|------------|----------------|
| `can_edit_personnel` | All fields |
| `can_view_personnel` (read-only) | Names, training status, duty status — no emergency contacts, no personal addresses, no counseling notes |
| No permission | 403 |

**File:** Update `src/routes/org/[orgId]/api/personnel-extended-info/+server.ts`

---

## Phase 3 — Operational Security

### 3.1 Data Retention Policy

Define retention periods (configurable per-org later):

| Data Type | Retention | Action on Expiry |
|-----------|-----------|-----------------|
| Audit logs | 1 year | Archive to cold storage, then delete |
| Counseling files (PDFs) | Until personnel record deleted | Cascade delete |
| Demo sandbox data | 1 hour | Auto-cleanup (already implemented) |
| Deleted org data | 30 days soft-delete, then hard purge | Scheduled cleanup |
| Stripe webhook events | 90 days | Purge old events |

**Implementation:** Supabase scheduled function or Vercel cron job for periodic cleanup.

### 3.2 Incident Response Plan

**New file:** `docs/security/incident-response.md`

Document:
- How to identify a breach (audit log alerts, unusual export patterns)
- Contact chain (who to notify)
- Steps to contain (revoke sessions, disable org, rotate keys)
- Notification obligations (affected users within 72 hours per NIST guidelines)
- Post-incident review process

### 3.3 Security Documentation

**New file:** `docs/security/security-overview.md`

Public-facing security documentation covering:
- Data handling practices
- Encryption standards (in-transit and at-rest)
- Access control model
- Audit logging
- Compliance alignment (NIST 800-171)
- Responsible disclosure policy

---

## Phase 4 — Compliance Marketing

### 4.1 Features Page — New Section

Add **"08 // Security & Compliance"** section to the features page following the existing alternating layout pattern:

**Content:**
- Heading: "Built for military-grade _data protection._"
- Description: Brief paragraph on NIST 800-171 alignment and why it matters for unit leaders
- Bullet points:
  - NIST SP 800-171 aligned for CUI protection
  - End-to-end encryption (in transit and at rest)
  - Row-level data isolation between organizations
  - Comprehensive audit logging
  - Role-based access controls with least-privilege defaults
- Demo panel: Visual showing the security layers (org isolation, RLS, encryption, audit trail)

### 4.2 Landing Page — Security Mention

Add a security-focused card to the existing 12-feature grid:

- Number: 13 (or replace one of the less impactful existing cards)
- Title: "Security & Compliance"
- Description: "NIST 800-171 aligned. Your personnel data is encrypted, access-controlled, and audit-logged. Built for the standards military leaders expect."

### 4.3 Pricing Page — Trust Badge

Add a small trust/compliance badge row below the pricing grid:

- Shield icon + "NIST 800-171 Aligned"
- Lock icon + "256-bit Encryption"
- Checkmark icon + "SOC 2 Type II" (when achieved — placeholder until then)

### 4.4 Footer — Security Link

Add "Security" link to footer navigation pointing to `/security` — a public page rendering the security overview doc from Phase 3.3.

---

## Implementation Order

```
Phase 1 (security hardening):
  1.1 Security headers          — hooks.server.ts modification
  1.2 Rate limiting             — new module + hooks integration
  1.3 Permission check gaps     — settings page.server.ts fixes
  1.4 Input validation          — new module + integration across routes
  1.5 Storage bucket policies   — new Supabase migration

Phase 2 (NIST compliance):
  2.1 Audit logging             — new table + logging module + integration
  2.2 Session management        — auth config + re-auth flow
  2.3 Password policy + MFA     — registration update + TOTP enrollment
  2.5 Data minimization         — API response filtering

Phase 3 (operational):
  3.1 Data retention            — cron jobs + cleanup functions
  3.2 Incident response plan    — documentation
  3.3 Security documentation    — public-facing docs

Phase 4 (marketing):
  4.1 Features page section     — new "Security & Compliance" section
  4.2 Landing page card         — add security feature card
  4.3 Pricing page badges       — trust/compliance badges
  4.4 Security page + footer    — /security public page
```

---

## Out of Scope

- **FedRAMP certification** — requires GovCloud hosting; revisit if pursuing government contracts
- **IL4/IL5 hosting** — requires AWS GovCloud or Azure Government; not needed for CUI
- **SOC 2 Type II audit** — requires third-party auditor; can pursue after controls are in place
- **CMMC formal assessment** — requires C3PAO assessment; controls here align with Level 2 but formal cert is a separate process
- **Field-level encryption** — Supabase encrypts at rest; application-layer encryption adds complexity without proportional benefit at this stage
