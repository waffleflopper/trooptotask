# TroopToTask Security Overview

## Data Classification

TroopToTask handles Controlled Unclassified Information (CUI) including:

- Personnel names and contact information
- Emergency contact details
- Counseling records and leader notes
- Training completion records

## Encryption

- **In transit:** All data encrypted via TLS 1.2+ (Vercel edge network + Supabase)
- **At rest:** Database encrypted via AES-256 (Supabase managed PostgreSQL)
- **File storage:** Encrypted at rest in private Supabase Storage, with sensitive file access mediated by app endpoints and short-lived signed URLs

## Access Control

- **Authentication:** Email/password with optional TOTP multi-factor authentication
- **Password policy:** 12-character minimum with uppercase, lowercase, and numeric characters
- **Authorization:** Role-based (owner/member) with granular permission flags per data category
- **Organization isolation:** Row-Level Security (RLS) on every database table ensures no cross-organization data access
- **Session management:** 24-hour absolute session limit

## Audit Logging

All security-relevant events are logged:

- Login attempts (success and failure)
- Personnel data access and modifications
- Data exports
- Permission changes
- Administrative actions

Audit logs are append-only and retained for 1 year.

## Environment-managed rollout notes

- Email confirmation is disabled in local development so invite and recovery flows can be exercised without depending on outbound mail delivery. Hosted production rollout is enabled separately when launch readiness allows.
- TOTP MFA support exists in the app, but hosted enablement may differ by environment while rollout is in progress.
- Local Supabase config is kept aligned with the intended hosted baseline for password strength and secure password change requirements so security reviews do not rely on weaker dev-only defaults.

## Infrastructure

- **Hosting:** Vercel (SOC 2 Type II certified)
- **Database:** Supabase (SOC 2 Type II certified)
- **Payments:** Stripe (PCI DSS Level 1 certified)

## Compliance Alignment

TroopToTask's security controls are aligned with NIST SP 800-171 Rev 2 for the protection of CUI, covering:

- Access Control (3.1)
- Audit & Accountability (3.3)
- Identification & Authentication (3.5)
- System & Communications Protection (3.13)

## Security Headers

All responses include:

- Content-Security-Policy
- Strict-Transport-Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

## Responsible Disclosure

If you discover a security vulnerability, please email security@trooptotask.app. We commit to acknowledging reports within 48 hours and providing resolution updates within 7 days.

## Rate Limiting

API endpoints are rate-limited to prevent abuse. Authentication endpoints have stricter limits to prevent brute-force attacks.
