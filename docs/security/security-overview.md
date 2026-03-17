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
- **File storage:** Encrypted at rest in Supabase Storage

## Access Control

- **Authentication:** Email/password with optional TOTP multi-factor authentication
- **Authorization:** Role-based (owner/member) with granular permission flags per data category
- **Organization isolation:** Row-Level Security (RLS) on every database table ensures no cross-organization data access
- **Session management:** 8-hour idle timeout, 24-hour absolute session limit

## Audit Logging

All security-relevant events are logged:

- Login attempts (success and failure)
- Personnel data access and modifications
- Data exports
- Permission changes
- Administrative actions

Audit logs are append-only and retained for 1 year.

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
