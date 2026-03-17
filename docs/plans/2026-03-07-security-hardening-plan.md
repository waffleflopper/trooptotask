# Security Hardening & NIST 800-171 Compliance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden TroopToTask against OWASP Top 10 and align with NIST SP 800-171 for CUI protection (personnel PII, counseling notes, training records).

**Architecture:** Four-phase approach — immediate hardening (headers, rate limiting, permission checks, input validation, storage policies), NIST compliance (audit logging, session management, password policy, MFA, data minimization), operational security (data retention, incident response docs, security docs), and compliance marketing (features/landing/pricing pages, public /security page).

**Tech Stack:** SvelteKit 2.5, Svelte 5, TypeScript, Supabase (Postgres + Auth), Vercel

---

## Phase 1 — Immediate Security Hardening

### Task 1: Security Response Headers

**Files:**

- Modify: `src/hooks.server.ts`

**Step 1: Add security headers to the handle function**

Add a `securityHeaders` map and apply them to every response. Insert this at the top of `hooks.server.ts`, and modify the `resolve()` call:

```typescript
const securityHeaders: Record<string, string> = {
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	'X-DNS-Prefetch-Control': 'off',
	'Content-Security-Policy': [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' https://js.stripe.com",
		"style-src 'self' 'unsafe-inline'",
		'frame-src https://js.stripe.com',
		"connect-src 'self' https://*.supabase.co",
		"img-src 'self' data: blob:",
		"font-src 'self'"
	].join('; ')
};
```

Modify the `return resolve(event, ...)` at the bottom of `handle` to:

```typescript
const response = await resolve(event, {
	filterSerializedResponseHeaders(name) {
		return name === 'content-range' || name === 'x-supabase-api-version';
	}
});

for (const [header, value] of Object.entries(securityHeaders)) {
	response.headers.set(header, value);
}

return response;
```

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manually verify headers appear in dev mode**

Run: `npm run dev` and check browser DevTools Network tab — all responses should include the security headers.

**Step 4: Commit**

```bash
git add src/hooks.server.ts
git commit -m "feat: add security response headers (CSP, HSTS, X-Frame-Options, etc.)"
```

---

### Task 2: Rate Limiting Module

**Files:**

- Create: `src/lib/server/rateLimit.ts`
- Modify: `src/hooks.server.ts`

**Step 1: Create the rate limiting module**

Create `src/lib/server/rateLimit.ts`:

```typescript
interface RateLimitEntry {
	count: number;
	resetAt: number;
}

interface RateLimitRule {
	pattern: RegExp;
	windowMs: number;
	maxRequests: number;
	/** Only apply to these HTTP methods. If omitted, applies to all. */
	methods?: string[];
}

const store = new Map<string, RateLimitEntry>();

// Clean stale entries every 5 minutes
setInterval(
	() => {
		const now = Date.now();
		for (const [key, entry] of store) {
			if (now > entry.resetAt) {
				store.delete(key);
			}
		}
	},
	5 * 60 * 1000
);

const rules: RateLimitRule[] = [
	{ pattern: /^\/auth\//, windowMs: 15 * 60 * 1000, maxRequests: 10 },
	{ pattern: /^\/api\/access-requests/, windowMs: 60 * 60 * 1000, maxRequests: 5 },
	{ pattern: /^\/api\/create-demo-sandbox/, windowMs: 60 * 60 * 1000, maxRequests: 3 },
	{
		pattern: /^\/org\/[^/]+\/api\/export/,
		windowMs: 60 * 60 * 1000,
		maxRequests: 10,
		methods: ['POST']
	},
	{
		pattern: /^\/org\/[^/]+\/api\//,
		windowMs: 60 * 1000,
		maxRequests: 30,
		methods: ['POST', 'PUT', 'DELETE']
	},
	{ pattern: /.*/, windowMs: 60 * 1000, maxRequests: 60 }
];

/**
 * Check rate limit for a request.
 * Returns { limited: false } if allowed, or { limited: true, retryAfterMs } if blocked.
 */
export function checkRateLimit(
	ip: string,
	pathname: string,
	method: string
): { limited: false } | { limited: true; retryAfterMs: number } {
	for (const rule of rules) {
		if (!rule.pattern.test(pathname)) continue;
		if (rule.methods && !rule.methods.includes(method)) continue;

		const key = `${ip}:${rule.pattern.source}`;
		const now = Date.now();
		const entry = store.get(key);

		if (!entry || now > entry.resetAt) {
			store.set(key, { count: 1, resetAt: now + rule.windowMs });
			return { limited: false };
		}

		entry.count++;

		if (entry.count > rule.maxRequests) {
			const retryAfterMs = entry.resetAt - now;
			return { limited: true, retryAfterMs };
		}

		return { limited: false };
	}

	return { limited: false };
}
```

**Step 2: Integrate rate limiting into hooks.server.ts**

Add at the top of the `handle` function, before the Supabase client creation:

```typescript
import { checkRateLimit } from '$lib/server/rateLimit';
```

Then add this block at the very beginning of the `handle` function body:

```typescript
// Rate limiting
const clientIp = event.getClientAddress();
const rateCheck = checkRateLimit(clientIp, event.url.pathname, event.request.method);
if (rateCheck.limited) {
	return new Response(JSON.stringify({ error: 'Too many requests' }), {
		status: 429,
		headers: {
			'Content-Type': 'application/json',
			'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000))
		}
	});
}
```

**Step 3: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/server/rateLimit.ts src/hooks.server.ts
git commit -m "feat: add in-memory rate limiting for auth, API, and export routes"
```

---

### Task 3: Server-Side Permission Checks on Settings Form Actions

**Files:**

- Modify: `src/routes/org/[orgId]/settings/+page.server.ts`
- Modify: `src/lib/server/permissions.ts`

**Step 1: Add `requireManageMembers` helper to permissions.ts**

Add this function to `src/lib/server/permissions.ts` after the existing `requireEditPermission`:

```typescript
/**
 * Requires that the user is the org owner or has canManageMembers permission.
 * Used for settings operations: rename org, invite, revoke invite, transfer ownership.
 */
export async function requireManageMembersPermission(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<void> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role, can_manage_members')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	if (membership.role !== 'owner' && !membership.can_manage_members) {
		throw error(403, 'You do not have permission to manage this organization');
	}
}

/**
 * Requires that the user is the org owner.
 * Used for destructive operations: delete org, transfer ownership.
 */
export async function requireOwnerRole(supabase: SupabaseClient, orgId: string, userId: string): Promise<void> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership || membership.role !== 'owner') {
		throw error(403, 'Only the organization owner can perform this action');
	}
}
```

**Step 2: Add permission checks to settings form actions**

In `src/routes/org/[orgId]/settings/+page.server.ts`, add the import:

```typescript
import { requireManageMembersPermission, requireOwnerRole } from '$lib/server/permissions';
```

Then add permission checks to each action:

**updateName** — after `if (!user)` check, add:

```typescript
await requireManageMembersPermission(locals.supabase, orgId, user.id);
```

**invite** — after `if (!user)` check, add:

```typescript
await requireManageMembersPermission(locals.supabase, orgId, user.id);
```

**revokeInvite** — after `if (!user)` check, add:

```typescript
await requireManageMembersPermission(locals.supabase, orgId, user.id);
```

**transferOwnership** — after `if (!user)` check, add:

```typescript
await requireOwnerRole(locals.supabase, orgId, user.id);
```

**Step 3: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/server/permissions.ts src/routes/org/[orgId]/settings/+page.server.ts
git commit -m "feat: add server-side permission checks to settings form actions"
```

---

### Task 4: Input Validation Module

**Files:**

- Create: `src/lib/server/validation.ts`

**Step 1: Create the validation module**

Create `src/lib/server/validation.ts`:

```typescript
/**
 * Centralized input validation utilities for sanitizing user input.
 * All user-provided data should be validated through these helpers.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX =
	/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Sanitize a string: trim whitespace, collapse internal whitespace, cap length.
 * Returns empty string if input is null/undefined.
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = 255): string {
	if (!input) return '';
	return input.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

/**
 * Validate an email address. Stricter than basic regex — also checks length and structure.
 */
export function validateEmail(email: string): boolean {
	if (!email || email.length > 254) return false;
	return EMAIL_REGEX.test(email);
}

/**
 * Validate a UUID string. Use on route params and form data IDs.
 */
export function validateUUID(id: string | null | undefined): boolean {
	if (!id) return false;
	return UUID_REGEX.test(id);
}

/**
 * Validate that a value is one of the allowed enum values.
 * Returns the matched value or null if invalid.
 */
export function validateEnum<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
	if (!value) return null;
	return allowed.includes(value as T) ? (value as T) : null;
}

/**
 * Validate a string is non-empty after trimming. Returns the sanitized string or null.
 */
export function requireString(input: string | null | undefined, maxLength: number = 255): string | null {
	const sanitized = sanitizeString(input, maxLength);
	return sanitized.length > 0 ? sanitized : null;
}
```

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/server/validation.ts
git commit -m "feat: add centralized input validation module"
```

---

### Task 5: Apply Input Validation to Settings Form Actions

**Files:**

- Modify: `src/routes/org/[orgId]/settings/+page.server.ts`

**Step 1: Add validation to settings actions**

Add import:

```typescript
import { sanitizeString, validateEmail, validateUUID } from '$lib/server/validation';
```

**updateName action** — replace the name extraction:

```typescript
const name = sanitizeString(formData.get('name') as string, 100);
```

**invite action** — replace the email extraction and add validation:

```typescript
const email = sanitizeString(formData.get('email') as string, 254).toLowerCase();
if (!validateEmail(email)) {
	return fail(400, { inviteError: 'Please enter a valid email address' });
}
```

**revokeInvite action** — add UUID validation:

```typescript
const inviteId = formData.get('inviteId') as string;
if (!validateUUID(inviteId)) {
	return fail(400, { error: 'Invalid invitation ID' });
}
```

**removeMember action** — add UUID validation:

```typescript
const membershipId = formData.get('membershipId') as string;
if (!validateUUID(membershipId)) {
	return fail(400, { memberError: 'Invalid membership ID' });
}
```

**updatePermissions action** — add UUID validation:

```typescript
const membershipId = formData.get('membershipId') as string;
if (!validateUUID(membershipId)) {
	return fail(400, { permissionError: 'Invalid membership ID' });
}
```

**transferOwnership action** — add UUID validation:

```typescript
const newOwnerId = formData.get('newOwnerId') as string;
if (!validateUUID(newOwnerId)) {
	return fail(400, { transferError: 'Invalid user ID' });
}
```

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/settings/+page.server.ts
git commit -m "feat: apply input validation to settings form actions"
```

---

### Task 6: Apply Input Validation to Auth Routes

**Files:**

- Modify: `src/routes/auth/register/+page.server.ts`
- Modify: `src/routes/auth/login/+page.server.ts`

**Step 1: Harden registration validation**

In `src/routes/auth/register/+page.server.ts`, add import:

```typescript
import { sanitizeString, validateEmail } from '$lib/server/validation';
```

Replace the existing input handling:

```typescript
const inviteCode = sanitizeString(formData.get('inviteCode') as string, 50);
const email = sanitizeString(formData.get('email') as string, 254).toLowerCase();
const password = formData.get('password') as string;
const confirmPassword = formData.get('confirmPassword') as string;

if (!inviteCode) {
	return fail(400, { error: 'Invite code is required', email, inviteCode });
}

if (!validateEmail(email)) {
	return fail(400, { error: 'Please enter a valid email address', email, inviteCode });
}

if (!password || password.length < 12) {
	return fail(400, { error: 'Password must be at least 12 characters', email, inviteCode });
}

if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
	return fail(400, { error: 'Password must include uppercase, lowercase, and a number', email, inviteCode });
}

if (password !== confirmPassword) {
	return fail(400, { error: 'Passwords do not match', email, inviteCode });
}
```

**Step 2: Harden login validation**

In `src/routes/auth/login/+page.server.ts`, add import:

```typescript
import { sanitizeString } from '$lib/server/validation';
```

Replace email extraction:

```typescript
const email = sanitizeString(formData.get('email') as string, 254).toLowerCase();
const password = formData.get('password') as string;
```

**Step 3: Update the registration form UI to reflect new password requirements**

In `src/routes/auth/register/+page.svelte`, find the password field and update any help text or placeholder to indicate "12 characters, mixed case + number".

**Step 4: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/routes/auth/register/+page.server.ts src/routes/auth/login/+page.server.ts src/routes/auth/register/+page.svelte
git commit -m "feat: harden auth input validation and upgrade password policy to 12-char minimum"
```

---

### Task 7: Apply Input Validation to API Endpoints

**Files:**

- Modify: `src/lib/server/crudFactory.ts`
- Modify: `src/routes/api/access-requests/+server.ts`
- Modify: `src/routes/api/feedback/+server.ts`

**Step 1: Add UUID validation to crudFactory**

In `src/lib/server/crudFactory.ts`, add import:

```typescript
import { validateUUID } from './validation';
```

In each of the POST, PUT, DELETE handlers, after extracting `orgId`, add:

```typescript
if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');
```

In PUT and DELETE handlers, after extracting `id` from body, add:

```typescript
if (!validateUUID(id)) throw error(400, 'Invalid resource ID');
```

**Step 2: Harden access-requests endpoint**

In `src/routes/api/access-requests/+server.ts`, add import and apply:

```typescript
import { sanitizeString, validateEmail } from '$lib/server/validation';
```

Apply `sanitizeString()` to name/message fields and `validateEmail()` to email.

**Step 3: Harden feedback endpoint**

In `src/routes/api/feedback/+server.ts`, add import and apply:

```typescript
import { sanitizeString, validateEnum } from '$lib/server/validation';
```

Apply `sanitizeString()` to message and `validateEnum()` to category.

**Step 4: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/lib/server/crudFactory.ts src/routes/api/access-requests/+server.ts src/routes/api/feedback/+server.ts
git commit -m "feat: apply input validation to CRUD factory and public API endpoints"
```

---

### Task 8: Supabase Storage Bucket RLS Policies

**Files:**

- Create: `supabase/migrations/20260307_storage_bucket_policies.sql`

**Step 1: Create the migration**

Create `supabase/migrations/20260307_storage_bucket_policies.sql`:

```sql
-- Storage bucket RLS policies for counseling-files
-- Ensures only org members can read files and only personnel editors can write/delete

-- Read: org members can access files in their org's folder
CREATE POLICY "Org members can read counseling files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'counseling-files'
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

-- Insert: only personnel editors can upload files
CREATE POLICY "Personnel editors can upload counseling files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'counseling-files'
  AND can_edit_personnel((storage.foldername(name))[1]::uuid)
);

-- Update: only personnel editors can update files
CREATE POLICY "Personnel editors can update counseling files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'counseling-files'
  AND can_edit_personnel((storage.foldername(name))[1]::uuid)
);

-- Delete: only personnel editors can delete files
CREATE POLICY "Personnel editors can delete counseling files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'counseling-files'
  AND can_edit_personnel((storage.foldername(name))[1]::uuid)
);
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260307_storage_bucket_policies.sql
git commit -m "feat: add RLS policies for counseling-files storage bucket"
```

---

## Phase 2 — NIST 800-171 Compliance Controls

### Task 9: Audit Logging — Database Table

**Files:**

- Create: `supabase/migrations/20260307_audit_logs.sql`

**Step 1: Create the audit_logs migration**

Create `supabase/migrations/20260307_audit_logs.sql`:

```sql
-- Audit logging table for NIST 800-171 compliance (control family 3.3)
-- Append-only via service role — no user INSERT/UPDATE/DELETE policies

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  ip_address inet,
  user_agent text,
  details jsonb DEFAULT '{}',
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical'))
);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only org owners and platform admins can read audit logs
CREATE POLICY "Org owners can read own audit logs"
ON audit_logs FOR SELECT
USING (
  is_org_owner(org_id) OR is_platform_admin()
);

-- No INSERT/UPDATE/DELETE policies for users
-- All writes go through service role (getAdminClient)

-- Index for common queries
CREATE INDEX idx_audit_logs_org_id_timestamp ON audit_logs(org_id, timestamp DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity) WHERE severity != 'info';
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260307_audit_logs.sql
git commit -m "feat: add audit_logs table with RLS for NIST 800-171 compliance"
```

---

### Task 10: Audit Logging — Application Module

**Files:**

- Create: `src/lib/server/auditLog.ts`

**Step 1: Create the audit logging helper**

Create `src/lib/server/auditLog.ts`:

```typescript
import { getAdminClient } from './supabase';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: AuditSeverity;
}

/**
 * Log a security-relevant event to the audit_logs table.
 * Uses service role client (append-only, bypasses RLS).
 * Fails silently — audit logging should never break the request.
 */
export async function auditLog(
	event: AuditEvent,
	requestInfo: {
		userId?: string | null;
		ip?: string;
		userAgent?: string;
	}
): Promise<void> {
	try {
		const admin = getAdminClient();
		await admin.from('audit_logs').insert({
			user_id: requestInfo.userId ?? null,
			org_id: event.orgId ?? null,
			action: event.action,
			resource_type: event.resourceType,
			resource_id: event.resourceId ?? null,
			ip_address: requestInfo.ip ?? null,
			user_agent: requestInfo.userAgent ?? null,
			details: event.details ?? {},
			severity: event.severity ?? 'info'
		});
	} catch {
		// Audit logging must never break the request
		console.error('Audit log write failed');
	}
}

/**
 * Extract request info from SvelteKit event for audit logging.
 */
export function getRequestInfo(event: {
	getClientAddress: () => string;
	request: { headers: Headers };
	locals: { user?: { id: string } | null };
}): { userId: string | null; ip: string; userAgent: string } {
	return {
		userId: event.locals.user?.id ?? null,
		ip: event.getClientAddress(),
		userAgent: event.request.headers.get('user-agent') ?? ''
	};
}
```

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/server/auditLog.ts
git commit -m "feat: add audit logging module for NIST 800-171 compliance"
```

---

### Task 11: Integrate Audit Logging into Critical Operations

**Files:**

- Modify: `src/routes/org/[orgId]/settings/+page.server.ts`
- Modify: `src/routes/org/[orgId]/api/export/+server.ts`
- Modify: `src/routes/org/[orgId]/api/export-excel/+server.ts`
- Modify: `src/routes/auth/login/+page.server.ts`
- Modify: `src/lib/server/crudFactory.ts`
- Modify: `src/hooks.server.ts` (rate limit logging)

**Step 1: Add audit logging to settings actions**

In `src/routes/org/[orgId]/settings/+page.server.ts`, add import:

```typescript
import { auditLog, getRequestInfo } from '$lib/server/auditLog';
```

Add audit logging calls after successful operations:

**invite** — after successful insert:

```typescript
auditLog(
	{ action: 'member.invite', resourceType: 'organization', orgId, details: { email } },
	{ userId: user.id, ip: event.getClientAddress(), userAgent: event.request.headers.get('user-agent') ?? '' }
);
```

Note: The `event` object is available in SvelteKit form actions — update the action signatures to destructure it. Each action already receives `{ params, request, locals }` — verify the full signature includes the fields needed. If `getClientAddress` is not available on form action events, extract IP from the request headers instead.

**removeMember** — after successful delete:

```typescript
auditLog(
	{ action: 'member.remove', resourceType: 'organization', orgId, details: { membershipId } },
	{ userId: user.id, ip: '', userAgent: '' }
);
```

**updatePermissions** — after successful update:

```typescript
auditLog(
	{
		action: 'member.permissions_changed',
		resourceType: 'organization',
		orgId,
		severity: 'warning',
		details: { membershipId, preset }
	},
	{ userId: user.id, ip: '', userAgent: '' }
);
```

**transferOwnership** — after successful RPC:

```typescript
auditLog(
	{
		action: 'org.ownership_transferred',
		resourceType: 'organization',
		orgId,
		severity: 'critical',
		details: { newOwnerId }
	},
	{ userId: user.id, ip: '', userAgent: '' }
);
```

**deleteOrganization** — after successful delete:

```typescript
auditLog(
	{ action: 'org.deleted', resourceType: 'organization', orgId, severity: 'critical' },
	{ userId: user.id, ip: '', userAgent: '' }
);
```

**Step 2: Add audit logging to export endpoints**

In `src/routes/org/[orgId]/api/export/+server.ts` and `export-excel/+server.ts`, add:

```typescript
import { auditLog } from '$lib/server/auditLog';
```

After the export is initiated successfully:

```typescript
auditLog(
	{ action: 'export.created', resourceType: 'data_export', orgId },
	{ userId: locals.user!.id, ip: '', userAgent: '' }
);
```

**Step 3: Add audit logging to login**

In `src/routes/auth/login/+page.server.ts`, add:

```typescript
import { auditLog } from '$lib/server/auditLog';
```

After successful login:

```typescript
auditLog(
	{ action: 'auth.login_success', resourceType: 'user', details: { email } },
	{ userId: null, ip: '', userAgent: '' }
);
```

After failed login (in the error handler):

```typescript
auditLog(
	{ action: 'auth.login_failure', resourceType: 'user', severity: 'warning', details: { email } },
	{ userId: null, ip: '', userAgent: '' }
);
```

**Step 4: Add audit logging for rate limit violations in hooks.server.ts**

In the rate limit check block in `hooks.server.ts`, before returning 429:

```typescript
import { auditLog } from '$lib/server/auditLog';

// Inside the rate limit block:
auditLog(
	{
		action: 'security.rate_limit_exceeded',
		resourceType: 'request',
		severity: 'warning',
		details: { pathname: event.url.pathname, method: event.request.method }
	},
	{ userId: event.locals.user?.id ?? null, ip: clientIp, userAgent: event.request.headers.get('user-agent') ?? '' }
);
```

**Step 5: Add audit logging to crudFactory for PII mutations**

In `src/lib/server/crudFactory.ts`, add import and log on POST/PUT/DELETE for tables containing PII. Add a `auditActions` option to `CrudConfig`:

```typescript
/** If set, audit log mutations with this resource type */
auditResourceType?: string;
```

Then in POST/PUT/DELETE handlers, after successful operation:

```typescript
if (config.auditResourceType) {
	const { auditLog } = await import('./auditLog');
	auditLog(
		{ action: `${config.auditResourceType}.${method}`, resourceType: config.auditResourceType, resourceId: id, orgId },
		{ userId, ip: '', userAgent: '' }
	);
}
```

**Step 6: Enable audit logging on PII-related CRUD endpoints**

Add `auditResourceType` to the crud configs for:

- `personnel-extended-info/+server.ts` — `auditResourceType: 'personnel_extended_info'`
- `counseling-records/+server.ts` — `auditResourceType: 'counseling_record'`

**Step 7: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: integrate audit logging into auth, settings, exports, and PII CRUD operations"
```

---

### Task 12: Session Management — Timeout Configuration

**Files:**

- Modify: `src/hooks.server.ts`

**Step 1: Add session age check**

Supabase handles token refresh via its SSR library. To enforce idle/absolute timeouts, add a check in `hooks.server.ts` after the session is retrieved. If the session's `created_at` is older than 24 hours, force sign-out:

```typescript
// After getting session and user:
if (user) {
	const sessionCreated = new Date(user.last_sign_in_at ?? 0).getTime();
	const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
	if (Date.now() - sessionCreated > maxSessionAge) {
		await event.locals.supabase.auth.signOut();
		event.locals.session = null;
		event.locals.user = null;
	}
}
```

Note: Supabase's JWT expiry handles the idle timeout via `jwt_expiry` in the Supabase dashboard settings (set to 8 hours). The application-level check here enforces the absolute maximum.

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/hooks.server.ts
git commit -m "feat: enforce 24-hour absolute session timeout for NIST 800-171 compliance"
```

---

### Task 13: Data Minimization — API Response Filtering

**Files:**

- Modify: `src/routes/org/[orgId]/api/personnel-extended-info/+server.ts`
- Create: `src/lib/server/piiFilter.ts`

**Step 1: Create PII field filter**

Create `src/lib/server/piiFilter.ts`:

```typescript
/**
 * Sensitive PII fields that should only be returned to personnel editors.
 * Viewers get these fields redacted from API responses.
 */
const SENSITIVE_FIELDS = new Set([
	'emergencyContactName',
	'emergencyContactRelationship',
	'emergencyContactPhone',
	'spouseName',
	'spousePhone',
	'personalEmail',
	'personalPhone',
	'addressStreet',
	'addressCity',
	'addressState',
	'addressZip',
	'vehicleMakeModel',
	'vehiclePlate',
	'vehicleColor',
	'leaderNotes'
]);

/**
 * Strip sensitive PII fields from a response object.
 * Used when the requester has view-only permission (not edit).
 */
export function redactSensitiveFields<T extends Record<string, unknown>>(data: T): Partial<T> {
	const filtered: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (!SENSITIVE_FIELDS.has(key)) {
			filtered[key] = value;
		}
	}
	return filtered as Partial<T>;
}
```

**Step 2: Add GET handler with permission-based filtering to personnel-extended-info**

The current endpoint only has POST/PUT/DELETE via crudFactory. Add a GET handler that checks permission level and filters accordingly.

In `src/routes/org/[orgId]/api/personnel-extended-info/+server.ts`, add a GET handler:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { redactSensitiveFields } from '$lib/server/piiFilter';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	if (!orgId) throw error(400, 'Missing orgId');

	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	// Check permission level
	let canEdit = isSandbox; // sandbox gets full access for demo
	if (!isSandbox && userId) {
		const { data: membership } = await supabase
			.from('organization_memberships')
			.select('role, can_edit_personnel')
			.eq('organization_id', orgId)
			.eq('user_id', userId)
			.single();

		if (!membership) throw error(403, 'Not a member of this organization');
		canEdit = membership.role === 'owner' || membership.can_edit_personnel;
	}

	const { data, error: dbError } = await supabase
		.from('personnel_extended_info')
		.select('*')
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	const rows = data ?? [];
	if (canEdit) {
		return json(rows);
	}

	// Redact sensitive fields for view-only users
	return json(rows.map(redactSensitiveFields));
};
```

**Step 3: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/server/piiFilter.ts src/routes/org/[orgId]/api/personnel-extended-info/+server.ts
git commit -m "feat: add PII field filtering based on permission level for data minimization"
```

---

### Task 14: MFA — TOTP Enrollment Flow

**Files:**

- Create: `src/routes/account/security/+page.svelte`
- Create: `src/routes/account/security/+page.server.ts`

**Step 1: Create the account security page server load**

Create `src/routes/account/security/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/login');

	// Check if user has MFA factors enrolled
	const { data: factors } = await locals.supabase.auth.mfa.listFactors();
	const totpFactors = factors?.totp ?? [];
	const hasMFA = totpFactors.some((f) => f.status === 'verified');

	return { hasMFA };
};
```

**Step 2: Create the account security page UI**

Create `src/routes/account/security/+page.svelte` with:

- Current MFA status display
- "Enable MFA" button that calls `supabase.auth.mfa.enroll({ factorType: 'totp' })`
- QR code display for TOTP setup (using the returned `totp.qr_code` data URL)
- Verification code input that calls `supabase.auth.mfa.challengeAndVerify()`
- "Disable MFA" button that calls `supabase.auth.mfa.unenroll()`

Follow the existing app design patterns: use `.btn`, `.input`, `.form-group` classes, and the standard page layout.

**Step 3: Add MFA challenge to login flow**

In `src/routes/auth/login/+page.server.ts`, after successful `signInWithPassword`:

- Check if the response includes an MFA challenge (`data.session === null` and error code indicates MFA required)
- If MFA is required, redirect to a `/auth/mfa-verify` page instead of dashboard

Create `src/routes/auth/mfa-verify/+page.svelte` with:

- TOTP code input (6 digits)
- Verify button that calls `supabase.auth.mfa.challengeAndVerify()`
- Redirect to dashboard on success

**Step 4: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/routes/account/security/ src/routes/auth/mfa-verify/
git commit -m "feat: add TOTP MFA enrollment and verification flow"
```

---

## Phase 3 — Operational Security

### Task 15: Data Retention — Cleanup Cron Job

**Files:**

- Create: `src/routes/api/cleanup-old-data/+server.ts`
- Modify: `vercel.json`
- Create: `supabase/migrations/20260307_data_retention.sql`

**Step 1: Create the retention cleanup SQL functions**

Create `supabase/migrations/20260307_data_retention.sql`:

```sql
-- Data retention cleanup functions

-- Delete audit logs older than 1 year
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM audit_logs
  WHERE timestamp < now() - interval '1 year';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Delete Stripe webhook events older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM stripe_webhook_events
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
```

**Step 2: Create the cleanup API endpoint**

Create `src/routes/api/cleanup-old-data/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ request }) => {
	// Verify cleanup secret (same pattern as demo cleanup)
	const authHeader = request.headers.get('authorization');
	const cleanupSecret = env.CLEANUP_SECRET;
	const cronSecret = env.CRON_SECRET;

	const isAuthorized = authHeader === `Bearer ${cleanupSecret}` || authHeader === `Bearer ${cronSecret}`;

	if (!isAuthorized) {
		throw error(401, 'Unauthorized');
	}

	const admin = getAdminClient();

	const [auditResult, webhookResult] = await Promise.all([
		admin.rpc('cleanup_old_audit_logs'),
		admin.rpc('cleanup_old_webhook_events')
	]);

	return json({
		auditLogsDeleted: auditResult.data ?? 0,
		webhookEventsDeleted: webhookResult.data ?? 0
	});
};
```

**Step 3: Add cron job to vercel.json**

Add a new cron entry:

```json
{
	"path": "/api/cleanup-old-data",
	"schedule": "0 4 * * 0"
}
```

This runs weekly on Sunday at 4 AM UTC.

**Step 4: Commit**

```bash
git add supabase/migrations/20260307_data_retention.sql src/routes/api/cleanup-old-data/+server.ts vercel.json
git commit -m "feat: add data retention cleanup cron for audit logs and webhook events"
```

---

### Task 16: Incident Response Plan

**Files:**

- Create: `docs/security/incident-response.md`

**Step 1: Write the incident response plan**

Create `docs/security/incident-response.md`:

```markdown
# TroopToTask Incident Response Plan

## 1. Identification

Monitor for indicators of compromise:

- Unusual audit log patterns (bulk data access, export spikes, failed auth attempts)
- Supabase dashboard alerts (unusual query patterns, connection spikes)
- Stripe webhook failures or unexpected subscription changes
- User reports of unauthorized access

## 2. Containment

Immediate actions upon confirmed breach:

1. **Disable affected user accounts** — via Supabase Auth dashboard
2. **Rotate credentials:**
   - Supabase service role key
   - Stripe API keys and webhook secret
   - Resend API key
   - CLEANUP_SECRET / CRON_SECRET
3. **Revoke all active sessions** — via Supabase Auth admin API
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
```

**Step 2: Commit**

```bash
git add docs/security/incident-response.md
git commit -m "docs: add incident response plan for NIST 800-171 compliance"
```

---

### Task 17: Public Security Documentation

**Files:**

- Create: `docs/security/security-overview.md`

**Step 1: Write the security overview**

Create `docs/security/security-overview.md`:

```markdown
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
```

**Step 2: Commit**

```bash
git add docs/security/security-overview.md
git commit -m "docs: add public-facing security overview documentation"
```

---

## Phase 4 — Compliance Marketing

### Task 18: Features Page — Security Section

**Files:**

- Modify: `src/routes/features/+page.svelte`

**Step 1: Add "08 // Security & Compliance" section**

Follow the existing feature section pattern (alternating left/right layout). Add after the last feature section (07 // Daily Assignments) and before the CTA section:

```svelte
<section class="feature-section reverse">
	<div class="feature-text">
		<span class="feature-label">08 // Security & Compliance</span>
		<h2>Built for military-grade <em>data protection.</em></h2>
		<p>
			Your personnel data deserves the same standard of protection you bring to your mission. TroopToTask aligns with
			NIST SP 800-171 controls for Controlled Unclassified Information.
		</p>
		<ul>
			<li>NIST SP 800-171 aligned for CUI protection</li>
			<li>End-to-end encryption in transit and at rest</li>
			<li>Row-level data isolation between organizations</li>
			<li>Comprehensive audit logging of all data access</li>
			<li>Role-based access controls with least-privilege defaults</li>
			<li>Multi-factor authentication support</li>
		</ul>
	</div>
	<div class="feature-demo">
		<!-- Security layers visual -->
		<div class="demo-browser">
			<div class="demo-browser-bar">
				<span class="demo-dot"></span><span class="demo-dot"></span><span class="demo-dot"></span>
			</div>
			<div class="security-visual">
				<!-- Build a layered security visual using CSS matching the existing demo panel style -->
				<!-- Show stacked layers: Encryption > RLS/Org Isolation > Audit Trail > Access Controls -->
			</div>
		</div>
	</div>
</section>
```

Style the security visual using the existing demo panel CSS patterns. Use the brass accent color for security-related elements.

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/routes/features/+page.svelte
git commit -m "feat: add Security & Compliance section to features page"
```

---

### Task 19: Landing Page — Security Feature Card

**Files:**

- Modify: `src/routes/+page.svelte`

**Step 1: Add security card to the feature grid**

Find the feature grid section (12 numbered feature cards). Add a 13th card:

```svelte
<div class="feature-card">
	<span class="feature-number">13</span>
	<h3>Security & Compliance</h3>
	<p>
		NIST 800-171 aligned. Your personnel data is encrypted, access-controlled, and audit-logged. Built for the standards
		military leaders expect.
	</p>
</div>
```

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add security feature card to landing page"
```

---

### Task 20: Pricing Page — Trust Badges

**Files:**

- Modify: `src/routes/pricing/+page.svelte`

**Step 1: Add trust badge row below pricing grid**

After the pricing grid and before the FAQ section, add a trust badge row:

```svelte
<div class="trust-badges">
	<div class="trust-badge">
		<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
		</svg>
		<span>NIST 800-171 Aligned</span>
	</div>
	<div class="trust-badge">
		<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
			<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</svg>
		<span>256-bit Encryption</span>
	</div>
	<div class="trust-badge">
		<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
		</svg>
		<span>Audit Logged</span>
	</div>
</div>
```

Add styles:

```css
.trust-badges {
	display: flex;
	justify-content: center;
	gap: var(--spacing-xl);
	padding: var(--spacing-lg) 0;
	margin-top: var(--spacing-lg);
}

.trust-badge {
	display: flex;
	align-items: center;
	gap: var(--spacing-sm);
	color: var(--color-text-secondary);
	font-size: var(--font-size-sm);
	font-family: var(--font-mono);
	letter-spacing: 0.05em;
	text-transform: uppercase;
}

.trust-badge svg {
	color: var(--brass);
	flex-shrink: 0;
}
```

Note: Replaced "SOC 2 Type II" placeholder with "Audit Logged" since SOC 2 is not yet achieved.

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/routes/pricing/+page.svelte
git commit -m "feat: add trust/compliance badges to pricing page"
```

---

### Task 21: Public Security Page + Footer Link

**Files:**

- Create: `src/routes/security/+page.svelte`
- Modify: `src/hooks.server.ts` (add to public routes)
- Modify: Footer component in landing/features/pricing pages

**Step 1: Create the /security public page**

Create `src/routes/security/+page.svelte` that renders the security overview content. Follow the same page layout as the features page (classification bar, nav, hero header, content sections, footer). Render the content from `docs/security/security-overview.md` as structured HTML sections — do NOT use {@html}, manually convert to Svelte markup.

Sections:

- Hero header: "Security & Compliance" with subtitle about NIST 800-171 alignment
- Data Classification
- Encryption
- Access Control
- Audit Logging
- Infrastructure
- Compliance Alignment
- Security Headers
- Responsible Disclosure
- Rate Limiting

**Step 2: Add /security to public routes in hooks.server.ts**

In `src/hooks.server.ts`, add `'/security'` to the `publicRoutes` array.

**Step 3: Add "Security" link to footer**

Find the footer component (likely in the landing/features/pricing page files — they share a common footer structure). Add a "Security" link pointing to `/security`.

**Step 4: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/routes/security/ src/hooks.server.ts src/routes/+page.svelte src/routes/features/+page.svelte src/routes/pricing/+page.svelte
git commit -m "feat: add public /security page and footer link"
```

---

## Final Verification

### Task 22: Full Build + Verification

**Step 1: Run type check**

Run: `npm run check`
Expected: No new errors (pre-existing errors documented in MEMORY.md are acceptable)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual verification checklist**

- [ ] Security headers appear on all responses (check DevTools)
- [ ] Rate limiting returns 429 after exceeding limits
- [ ] Settings actions return 403 for non-permitted users
- [ ] Password registration enforces 12-char + mixed case + number
- [ ] Login/logout events appear in audit_logs table
- [ ] /security page loads without auth
- [ ] Features page shows Security section
- [ ] Pricing page shows trust badges
- [ ] Landing page shows security feature card

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address verification issues from security hardening"
```
