# Security & Operational Improvements Backlog

Items that need implementation work before they can become enforced rules. Prioritized by risk.

---

## High Priority

### 1. Authentication & Session Management

- Re-authentication for sensitive actions (org deletion, billing changes, data export)
- Review Supabase Auth session/token lifetimes — enforce short-lived access tokens with refresh rotation
- Session fixation and hijacking mitigations
- **Why:** Military tool — session hijacking is a real threat vector. Supabase Auth handles basics but sensitive actions need extra verification.

### 2. Logging & Monitoring (Beyond Audit)

- Log all authentication events (login, logout, failed attempts)
- Log all permission denials
- Alerting on anomalous patterns (brute force, unusual data access volumes)
- Ensure logs themselves don't contain PII or secrets
- **Why:** NIST 800-171 requires security event monitoring. Current audit logging covers PII access but not auth events or anomaly detection.

### 3. Multi-Tenancy Testing

- Explicit test suite for RLS policies — verify org isolation with cross-org test scenarios
- Test that every table with org-scoped data has RLS enabled and policies are correct
- **Why:** A bug that leaks one unit's data to another would be catastrophic. RLS exists but isn't explicitly tested.

---

## Medium Priority

### 4. Dependency & Supply Chain Security

- Set up `npm audit` in CI pipeline
- Pin all dependency versions (verify lock file is committed and respected)
- Minimize third-party packages for auth/crypto paths
- No third-party CDN scripts in production
- Pre-commit hook to prevent accidental secret commits
- **Why:** Supply chain attacks are growing, military-adjacent software is high-value.

### 5. Data Retention & Cancellation Policy

- Define what happens when an org cancels subscription (data retained how long?)
- Ensure bulk export is available before data deletion
- Document data retention timeline for compliance
- **Why:** Military orgs may have data retention requirements. Need clear policy before government adoption.

### 6. Git & Code Review Hygiene

- Branch protection rules on main (no direct pushes)
- Pre-commit hooks for secret detection (e.g., git-secrets or similar)
- PR review requirement
- **Why:** Defense in depth — prevents accidental secret commits and unreviewed code reaching production.

---

## Lower Priority

### 7. Accessibility (Section 508)

- Audit for semantic HTML, ARIA labels, keyboard navigation
- Color contrast verification (military users in varied conditions — low light, high glare)
- Screen reader compatibility
- **Why:** If targeting government adoption, Section 508 compliance may be required. Good practice regardless for varied field conditions.
