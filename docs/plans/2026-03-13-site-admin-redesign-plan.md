# Site Admin Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the platform admin panel into a support-centric operations hub with global search, customer views, suspend/ban, announcements, role-based access, and moderate analytics.

**Architecture:** Support-centric redesign around "search → view → act" workflow. New DB tables for suspensions and announcements. Enhanced dashboard with CSS-only trend charts. Role-based sidebar gating (super_admin/support/billing). All actions audit-logged, all inputs validated, all endpoints rate-limited.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), TypeScript, Supabase (Postgres + Auth), CSS variables (no Tailwind), Vitest (unit tests), Playwright (e2e tests).

**Design Spec:** `docs/plans/2026-03-13-site-admin-redesign-design.md`

---

## File Structure

### New Files
- `supabase/migrations/20260313_site_admin_redesign.sql` — DB migration (tables, RPC functions, RLS)
- `src/routes/admin/api/search/+server.ts` — Global search API endpoint
- `src/routes/admin/api/suspend/+server.ts` — Suspend/unsuspend API endpoint
- `src/routes/admin/organizations/+page.server.ts` — Org list data loader
- `src/routes/admin/organizations/+page.svelte` — Org list page
- `src/routes/admin/organizations/[orgId]/+page.server.ts` — Org detail data loader
- `src/routes/admin/organizations/[orgId]/+page.svelte` — Org detail page
- `src/routes/admin/subscriptions/+page.server.ts` — Subscriptions overview loader
- `src/routes/admin/subscriptions/+page.svelte` — Subscriptions overview page
- `src/routes/admin/announcements/+page.server.ts` — Announcements management loader
- `src/routes/admin/announcements/+page.svelte` — Announcements management page
- `src/lib/components/AnnouncementBanner.svelte` — User-facing announcement banner
- `src/lib/components/admin/AdminSearch.svelte` — Global search component
- `src/lib/components/admin/SuspendModal.svelte` — Suspend confirmation modal
- `src/lib/components/admin/TransferOwnershipModal.svelte` — Transfer ownership modal
- `src/routes/api/announcements/dismiss/+server.ts` — Announcement dismissal endpoint
- `src/routes/suspended/+page.server.ts` — Suspended page guard
- `src/routes/suspended/+page.svelte` — Suspended user page
- `src/tests/admin/admin-helpers.test.ts` — Unit tests for admin helpers
- `src/tests/admin/search.test.ts` — Unit tests for search validation
- `src/tests/admin/suspension.test.ts` — Unit tests for suspension logic
- `src/tests/admin/announcements.test.ts` — Unit tests for announcement logic

### Modified Files
- `src/routes/admin/+layout.server.ts` — Add role-based page access map, announcement data
- `src/routes/admin/+layout.svelte` — Grouped sidebar, role gating, global search bar
- `src/routes/admin/+page.server.ts` — Enhanced dashboard metrics (RPC functions, trends)
- `src/routes/admin/+page.svelte` — Trend charts, subscription mix, activity feed, pending counts
- `src/routes/admin/users/+page.svelte` — Add suspension status column
- `src/routes/admin/users/[userId]/+page.server.ts` — Add activity, suspension data + actions
- `src/routes/admin/users/[userId]/+page.svelte` — Quick actions, activity feed, suspension UI
- `src/hooks.server.ts` — Add user suspension check
- `src/routes/org/[orgId]/+layout.server.ts` — Add org suspension check + announcement loading
- `src/lib/server/admin.ts` — Add role-based access helpers
- `src/lib/server/rateLimit.ts` — Add rate limit rules for new endpoints

---

## Chunk 1: Database Migration & Core Infrastructure

### Task 1: Write the database migration

**Files:**
- Create: `supabase/migrations/20260313_site_admin_redesign.sql`

- [ ] **Step 1: Write the migration SQL file**

```sql
-- Site Admin Panel Redesign Migration
-- Tables: user_suspensions, platform_announcements, announcement_dismissals
-- Columns: organizations.suspended_at
-- Functions: is_user_suspended, count_platform_users, daily_signups_last_30_days

-- =============================================================
-- 1. User Suspensions
-- =============================================================
CREATE TABLE user_suspensions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT
);

ALTER TABLE user_suspensions ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read/write suspensions
CREATE POLICY "Platform admins can manage suspensions"
  ON user_suspensions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

-- RPC: Check if a user is suspended (SECURITY DEFINER for hooks.server.ts)
CREATE OR REPLACE FUNCTION is_user_suspended(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_suspensions WHERE user_id = check_user_id
  );
$$;

-- =============================================================
-- 2. Organization Suspension
-- =============================================================
ALTER TABLE organizations ADD COLUMN suspended_at TIMESTAMPTZ;

-- =============================================================
-- 3. Platform Announcements
-- =============================================================
CREATE TYPE announcement_type AS ENUM ('info', 'warning', 'maintenance');

CREATE TABLE platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type announcement_type NOT NULL DEFAULT 'info',
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for banner display)
CREATE POLICY "Authenticated users can read announcements"
  ON platform_announcements
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only platform admins can write
CREATE POLICY "Platform admins can manage announcements"
  ON platform_announcements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

CREATE TABLE announcement_dismissals (
  announcement_id UUID NOT NULL REFERENCES platform_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can manage their own dismissals only
CREATE POLICY "Users can manage own dismissals"
  ON announcement_dismissals
  FOR ALL
  USING (auth.uid() = user_id);

-- =============================================================
-- 4. Dashboard RPC Functions
-- =============================================================

-- Count platform users (avoids listUsers API pagination ceiling)
CREATE OR REPLACE FUNCTION count_platform_users()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_build_object(
    'total', (SELECT count(*) FROM auth.users),
    'last_30_days', (
      SELECT count(*) FROM auth.users
      WHERE created_at >= now() - interval '30 days'
    ),
    'previous_30_days', (
      SELECT count(*) FROM auth.users
      WHERE created_at >= now() - interval '60 days'
      AND created_at < now() - interval '30 days'
    )
  );
$$;

-- Daily signups for trend chart
CREATE OR REPLACE FUNCTION daily_signups_last_30_days()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_agg(row_to_json(d))
  FROM (
    SELECT
      date_trunc('day', created_at)::date AS date,
      count(*) AS count
    FROM auth.users
    WHERE created_at >= now() - interval '30 days'
    GROUP BY date_trunc('day', created_at)::date
    ORDER BY date
  ) d;
$$;

-- =============================================================
-- 5. Search RPC (avoids listUsers API pagination ceiling)
-- =============================================================

-- Search users by email (platform admin only)
CREATE OR REPLACE FUNCTION search_users_by_email(search_query TEXT, max_results INT DEFAULT 5)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(json_agg(row_to_json(u)), '[]'::json)
  FROM (
    SELECT id, email, created_at, last_sign_in_at
    FROM auth.users
    WHERE email ILIKE '%' || search_query || '%'
    ORDER BY created_at DESC
    LIMIT max_results
  ) u;
$$;

-- =============================================================
-- 6. Indexes
-- =============================================================
CREATE INDEX idx_platform_announcements_active
  ON platform_announcements (is_active, expires_at)
  WHERE is_active = true;

CREATE INDEX idx_organizations_suspended
  ON organizations (suspended_at)
  WHERE suspended_at IS NOT NULL;
```

- [ ] **Step 2: Verify migration syntax locally**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260313_site_admin_redesign.sql`
Expected: All statements execute without errors.

- [ ] **Step 3: Verify tables and functions exist**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt user_suspensions; \dt platform_announcements; \dt announcement_dismissals; \df is_user_suspended; \df count_platform_users; \df daily_signups_last_30_days;"`
Expected: All 3 tables and 3 functions listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260313_site_admin_redesign.sql
git commit -m "feat(admin): add migration for suspensions, announcements, dashboard RPCs"
```

---

### Task 2: Add role-based access helpers to admin.ts

**Files:**
- Modify: `src/lib/server/admin.ts`
- Create: `src/tests/admin/admin-helpers.test.ts`

- [ ] **Step 1: Write failing tests for role-based access helpers**

Create `src/tests/admin/admin-helpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canAccessPage, getAccessiblePages } from '$lib/server/admin';
import type { AdminRole } from '$lib/server/admin';

describe('canAccessPage', () => {
  it('super_admin can access all pages', () => {
    const pages = ['dashboard', 'users', 'organizations', 'access-requests', 'feedback', 'subscriptions', 'gifting', 'audit', 'announcements'];
    for (const page of pages) {
      expect(canAccessPage('super_admin', page)).toBe(true);
    }
  });

  it('support can access support pages and dashboard', () => {
    expect(canAccessPage('support', 'dashboard')).toBe(true);
    expect(canAccessPage('support', 'users')).toBe(true);
    expect(canAccessPage('support', 'organizations')).toBe(true);
    expect(canAccessPage('support', 'access-requests')).toBe(true);
    expect(canAccessPage('support', 'feedback')).toBe(true);
  });

  it('support cannot access billing or system pages', () => {
    expect(canAccessPage('support', 'subscriptions')).toBe(false);
    expect(canAccessPage('support', 'gifting')).toBe(false);
    expect(canAccessPage('support', 'audit')).toBe(false);
    expect(canAccessPage('support', 'announcements')).toBe(false);
  });

  it('billing can access billing pages and dashboard', () => {
    expect(canAccessPage('billing', 'dashboard')).toBe(true);
    expect(canAccessPage('billing', 'subscriptions')).toBe(true);
    expect(canAccessPage('billing', 'gifting')).toBe(true);
  });

  it('billing cannot access support or system pages', () => {
    expect(canAccessPage('billing', 'users')).toBe(false);
    expect(canAccessPage('billing', 'organizations')).toBe(false);
    expect(canAccessPage('billing', 'access-requests')).toBe(false);
    expect(canAccessPage('billing', 'feedback')).toBe(false);
    expect(canAccessPage('billing', 'audit')).toBe(false);
    expect(canAccessPage('billing', 'announcements')).toBe(false);
  });

  it('returns false for unknown page', () => {
    expect(canAccessPage('super_admin', 'unknown-page')).toBe(false);
  });
});

describe('getAccessiblePages', () => {
  it('returns all pages for super_admin', () => {
    const pages = getAccessiblePages('super_admin');
    expect(pages).toHaveLength(9);
  });

  it('returns 5 pages for support', () => {
    const pages = getAccessiblePages('support');
    expect(pages).toHaveLength(5);
    expect(pages).toContain('dashboard');
    expect(pages).toContain('users');
    expect(pages).not.toContain('subscriptions');
  });

  it('returns 3 pages for billing', () => {
    const pages = getAccessiblePages('billing');
    expect(pages).toHaveLength(3);
    expect(pages).toContain('dashboard');
    expect(pages).toContain('subscriptions');
    expect(pages).not.toContain('users');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/admin/admin-helpers.test.ts`
Expected: FAIL — `canAccessPage` and `getAccessiblePages` not defined.

- [ ] **Step 3: Implement the role-based access helpers**

Add to `src/lib/server/admin.ts`:

```typescript
const PAGE_ACCESS: Record<string, AdminRole[]> = {
  'dashboard': ['super_admin', 'support', 'billing'],
  'users': ['super_admin', 'support'],
  'organizations': ['super_admin', 'support'],
  'access-requests': ['super_admin', 'support'],
  'feedback': ['super_admin', 'support'],
  'subscriptions': ['super_admin', 'billing'],
  'gifting': ['super_admin', 'billing'],
  'audit': ['super_admin'],
  'announcements': ['super_admin']
};

export function canAccessPage(role: AdminRole, page: string): boolean {
  const allowed = PAGE_ACCESS[page];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function getAccessiblePages(role: AdminRole): string[] {
  return Object.entries(PAGE_ACCESS)
    .filter(([, roles]) => roles.includes(role))
    .map(([page]) => page);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/admin/admin-helpers.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/admin.ts src/tests/admin/admin-helpers.test.ts
git commit -m "feat(admin): add role-based page access helpers with tests"
```

---

### Task 3: Add rate limit rules for new admin endpoints

**Files:**
- Modify: `src/lib/server/rateLimit.ts`

- [ ] **Step 1: Add rate limit rules for new admin endpoints**

Add these rules to the `rules` array in `src/lib/server/rateLimit.ts`, **before** the catch-all rule:

```typescript
// Admin search — moderate limit (debounced client-side)
{ pattern: /^\/admin\/api\/search$/, windowMs: 60_000, maxRequests: 30 },
// Admin suspend/unsuspend — strict limit
{ pattern: /^\/admin\/api\/suspend$/, windowMs: 60_000 * 15, maxRequests: 10, methods: ['POST'] },
// Admin announcements — moderate limit
{ pattern: /^\/admin\/announcements$/, windowMs: 60_000, maxRequests: 20, methods: ['POST'] },
// Announcement dismissals — per-user, moderate limit
{ pattern: /^\/api\/announcements\/dismiss$/, windowMs: 60_000, maxRequests: 20, methods: ['POST'] },
```

- [ ] **Step 2: Verify rate limit module still loads**

Run: `npx vitest run src/tests/admin/admin-helpers.test.ts`
Expected: Still passes (no breakage).

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/rateLimit.ts
git commit -m "feat(admin): add rate limit rules for search, suspend, announcements"
```

---

### Task 4: Add user suspension check to hooks.server.ts

**Files:**
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Read the current hooks.server.ts to find the right insertion point**

Look for where the session/auth check happens. The suspension check goes right after a valid session is confirmed, scoped to authenticated routes only.

- [ ] **Step 2: Add suspension check**

After the session validation block (where `event.locals.session` and `event.locals.user` are set), add:

```typescript
// Check user suspension (skip for public routes, auth routes, and the suspended page itself)
const skipSuspensionCheck = ['/auth', '/api/auth', '/suspended'].some(p => event.url.pathname.startsWith(p));
if (event.locals.user && !skipSuspensionCheck) {
  const { data: isSuspended } = await event.locals.supabase.rpc('is_user_suspended', {
    check_user_id: event.locals.user.id
  });
  if (isSuspended) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/suspended' }
    });
  }
}
```

- [ ] **Step 3: Create the suspended page**

Create `src/routes/suspended/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  // If not logged in or not suspended, redirect away
  if (!locals.user) throw redirect(302, '/auth/login');

  const { data: isSuspended } = await locals.supabase.rpc('is_user_suspended', {
    check_user_id: locals.user.id
  });
  if (!isSuspended) throw redirect(302, '/dashboard');
};
```

Create `src/routes/suspended/+page.svelte`:

```svelte
<script lang="ts">
  // Server-side guard ensures only suspended users see this
</script>

<div class="suspended-container">
  <div class="suspended-card">
    <h1>Account Suspended</h1>
    <p>Your account has been suspended. If you believe this is an error, please contact support.</p>
    <p class="contact">support@trooptotask.com</p>
    <a href="/auth/login" class="btn btn-secondary">Back to Login</a>
  </div>
</div>

<style>
  .suspended-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--color-bg);
    padding: var(--spacing-lg);
  }

  .suspended-card {
    text-align: center;
    max-width: 440px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
  }

  h1 {
    color: var(--color-error);
    margin-bottom: var(--spacing-md);
  }

  p {
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-md);
  }

  .contact {
    font-weight: 600;
    color: var(--color-text);
  }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks.server.ts src/routes/suspended/+page.svelte
git commit -m "feat(admin): add user suspension check in hooks and suspended page"
```

---

### Task 5: Add org suspension check to org layout

**Files:**
- Modify: `src/routes/org/[orgId]/+layout.server.ts`

- [ ] **Step 1: Read the current org layout server file**

Find where the org data is loaded (the query that fetches the organization record).

- [ ] **Step 2: Add suspension check after org load**

After the org record is fetched, add:

```typescript
// Check org suspension
if (org.suspended_at) {
  return {
    orgSuspended: true,
    orgId,
    orgName: org.name
  };
}
```

- [ ] **Step 3: Add suspension UI in org layout**

In `src/routes/org/[orgId]/+layout.svelte`, add a check at the top of the template:

```svelte
{#if data.orgSuspended}
  <div class="suspended-org-container">
    <div class="suspended-org-card">
      <h1>Organization Suspended</h1>
      <p>This organization ({data.orgName}) has been suspended. If you believe this is an error, please contact support.</p>
      <p class="contact">support@trooptotask.com</p>
      <a href="/dashboard" class="btn btn-secondary">Back to Dashboard</a>
    </div>
  </div>
{:else}
  <!-- existing layout content -->
{/if}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/org/[orgId]/+layout.server.ts src/routes/org/[orgId]/+layout.svelte
git commit -m "feat(admin): add org suspension check in org layout"
```

---

## Chunk 2: Layout Redesign & Global Search

### Task 6: Redesign admin layout with grouped sidebar and role gating

**Files:**
- Modify: `src/routes/admin/+layout.server.ts`
- Modify: `src/routes/admin/+layout.svelte`

- [ ] **Step 1: Update layout server to return accessible pages**

In `src/routes/admin/+layout.server.ts`, import and use `getAccessiblePages`:

```typescript
import { getAccessiblePages } from '$lib/server/admin';
```

Add to the return object:

```typescript
accessiblePages: getAccessiblePages(adminRole),
adminRole
```

- [ ] **Step 2: Rewrite the layout sidebar with grouped navigation**

Replace the nav section in `src/routes/admin/+layout.svelte` with grouped sidebar:

The sidebar should have these groups:
- Top: Dashboard (always visible)
- SUPPORT section: Users, Organizations, Access Requests, Feedback
- BILLING section: Subscriptions, Gifting
- SYSTEM section: Audit Log, Announcements
- Footer: Exit Admin link + admin email

Each nav item is only rendered if `data.accessiblePages.includes(pageName)`.

Define nav items as data:

```typescript
const navGroups = [
  { items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }] },
  { label: 'SUPPORT', items: [
    { label: 'Users', href: '/admin/users', page: 'users' },
    { label: 'Organizations', href: '/admin/organizations', page: 'organizations' },
    { label: 'Access Requests', href: '/admin/access-requests', page: 'access-requests' },
    { label: 'Feedback', href: '/admin/feedback', page: 'feedback' },
  ]},
  { label: 'BILLING', items: [
    { label: 'Subscriptions', href: '/admin/subscriptions', page: 'subscriptions' },
    { label: 'Gifting', href: '/admin/gifting', page: 'gifting' },
  ]},
  { label: 'SYSTEM', items: [
    { label: 'Audit Log', href: '/admin/audit', page: 'audit' },
    { label: 'Announcements', href: '/admin/announcements', page: 'announcements' },
  ]},
];
```

Filter each group's items by `data.accessiblePages`. Hide the group label if no items visible.

- [ ] **Step 3: Add global search bar to the layout header area**

Add a search input to the top of the main content area (above `<slot />`). This will be wired up in Task 7.

```svelte
<div class="admin-header">
  <AdminSearch />
  <div class="admin-header-right">
    <span class="role-badge">{data.adminRole?.toUpperCase()}</span>
  </div>
</div>
```

- [ ] **Step 4: Verify the layout renders correctly**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin/+layout.server.ts src/routes/admin/+layout.svelte
git commit -m "feat(admin): redesign layout with grouped sidebar and role gating"
```

---

### Task 7: Build global search endpoint

**Files:**
- Create: `src/routes/admin/api/search/+server.ts`
- Create: `src/tests/admin/search.test.ts`

- [ ] **Step 1: Write failing tests for search input validation**

Create `src/tests/admin/search.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateSearchQuery } from '$lib/server/admin';

describe('validateSearchQuery', () => {
  it('returns null for queries shorter than 3 chars', () => {
    expect(validateSearchQuery('ab')).toBeNull();
    expect(validateSearchQuery('')).toBeNull();
  });

  it('returns sanitized string for valid queries', () => {
    expect(validateSearchQuery('test@email.com')).toBe('test@email.com');
  });

  it('trims whitespace', () => {
    expect(validateSearchQuery('  test  ')).toBe('test');
  });

  it('truncates to 100 characters', () => {
    const long = 'a'.repeat(150);
    const result = validateSearchQuery(long);
    expect(result?.length).toBe(100);
  });

  it('returns null for null/undefined input', () => {
    expect(validateSearchQuery(null as unknown as string)).toBeNull();
    expect(validateSearchQuery(undefined as unknown as string)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/admin/search.test.ts`
Expected: FAIL — `validateSearchQuery` not defined.

- [ ] **Step 3: Implement validateSearchQuery in admin.ts**

Add to `src/lib/server/admin.ts`:

```typescript
export function validateSearchQuery(query: string): string | null {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (trimmed.length < 3) return null;
  return trimmed.slice(0, 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/admin/search.test.ts`
Expected: All PASS.

- [ ] **Step 5: Create the search API endpoint**

Create `src/routes/admin/api/search/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPlatformAdmin, validateSearchQuery } from '$lib/server/admin';
import { sanitizeString } from '$lib/server/validation';
import { getAdminClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
  const { user, supabase } = locals;
  if (!user) throw error(401, 'Not authenticated');

  const isAdmin = await isPlatformAdmin(supabase, user.id);
  if (!isAdmin) throw error(403, 'Not authorized');

  const rawQuery = url.searchParams.get('q') ?? '';
  const sanitized = sanitizeString(rawQuery, 100);
  const query = validateSearchQuery(sanitized);
  if (!query) return json({ users: [], organizations: [] });

  const adminClient = getAdminClient();

  // Search users by email via RPC (avoids listUsers 1000 cap)
  const { data: matchedUsers } = await adminClient.rpc('search_users_by_email', {
    search_query: query,
    max_results: 5
  });

  // Get org counts for matched users
  const userResults = await Promise.all(
    (matchedUsers ?? []).map(async (u: { id: string; email: string }) => {
      const { count } = await adminClient
        .from('organization_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', u.id);
      return {
        id: u.id,
        email: u.email ?? '',
        orgCount: count ?? 0
      };
    })
  );

  // Search organizations by name (parameterized via .ilike())
  const { data: orgs } = await adminClient
    .from('organizations')
    .select('id, name, subscription_tier, demo_type')
    .is('demo_type', null)
    .ilike('name', `%${query}%`)
    .limit(5);

  const orgResults = await Promise.all(
    (orgs ?? []).map(async (org) => {
      const { count } = await adminClient
        .from('personnel')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .is('archived_at', null);
      return {
        id: org.id,
        name: org.name,
        tier: org.subscription_tier ?? 'free',
        personnelCount: count ?? 0
      };
    })
  );

  return json({ users: userResults, organizations: orgResults });
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/admin.ts src/tests/admin/search.test.ts src/routes/admin/api/search/+server.ts
git commit -m "feat(admin): add global search endpoint with validation"
```

---

### Task 8: Build AdminSearch component

**Files:**
- Create: `src/lib/components/admin/AdminSearch.svelte`

- [ ] **Step 1: Create the AdminSearch component**

```svelte
<script lang="ts">
  let query = $state('');
  let results = $state<{ users: Array<{ id: string; email: string; orgCount: number }>; organizations: Array<{ id: string; name: string; tier: string; personnelCount: number }> }>({ users: [], organizations: [] });
  let isOpen = $state(false);
  let loading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput() {
    clearTimeout(debounceTimer);
    if (query.trim().length < 3) {
      results = { users: [], organizations: [] };
      isOpen = false;
      return;
    }
    debounceTimer = setTimeout(async () => {
      loading = true;
      try {
        const res = await fetch(`/admin/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          results = await res.json();
          isOpen = results.users.length > 0 || results.organizations.length > 0;
        }
      } finally {
        loading = false;
      }
    }, 300);
  }

  function close() {
    setTimeout(() => { isOpen = false; }, 200);
  }
</script>

<div class="admin-search">
  <input
    type="text"
    class="input search-input"
    placeholder="Search users by email or orgs by name..."
    bind:value={query}
    oninput={handleInput}
    onblur={close}
  />
  {#if isOpen}
    <div class="search-dropdown">
      {#if results.users.length > 0}
        <div class="search-section-label">Users</div>
        {#each results.users as user}
          <a href="/admin/users/{user.id}" class="search-result">
            <span class="search-result-primary">{user.email}</span>
            <span class="search-result-secondary">{user.orgCount} org{user.orgCount !== 1 ? 's' : ''}</span>
          </a>
        {/each}
      {/if}
      {#if results.organizations.length > 0}
        <div class="search-section-label">Organizations</div>
        {#each results.organizations as org}
          <a href="/admin/organizations/{org.id}" class="search-result">
            <span class="search-result-primary">{org.name}</span>
            <span class="search-result-meta">
              <span class="tier-badge tier-{org.tier}">{org.tier}</span>
              <span class="search-result-secondary">{org.personnelCount} personnel</span>
            </span>
          </a>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .admin-search {
    position: relative;
    flex: 1;
    max-width: 500px;
  }

  .search-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
  }

  .search-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-top: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    max-height: 400px;
    overflow-y: auto;
  }

  .search-section-label {
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--color-divider);
  }

  .search-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    text-decoration: none;
    color: var(--color-text);
    border-bottom: 1px solid var(--color-divider);
  }

  .search-result:hover {
    background: var(--color-surface-variant);
  }

  .search-result-primary {
    font-size: var(--font-size-sm);
  }

  .search-result-secondary {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .search-result-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .tier-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    text-transform: uppercase;
  }

  .tier-free { background: var(--color-surface-variant); color: var(--color-text-muted); }
  .tier-team { background: var(--color-primary); color: white; }
  .tier-unit { background: #7c4dff; color: white; }
</style>
```

- [ ] **Step 2: Import AdminSearch in admin layout**

In `src/routes/admin/+layout.svelte`, add:

```typescript
import AdminSearch from '$lib/components/admin/AdminSearch.svelte';
```

And place `<AdminSearch />` in the header bar.

- [ ] **Step 3: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/admin/AdminSearch.svelte src/routes/admin/+layout.svelte
git commit -m "feat(admin): add global search component with debounced dropdown"
```

---

## Chunk 3: Dashboard Enhancement

### Task 9: Enhance dashboard data loading

**Files:**
- Modify: `src/routes/admin/+page.server.ts`

- [ ] **Step 1: Read the current dashboard page.server.ts**

Understand the existing data loading pattern.

- [ ] **Step 2: Replace/enhance the data loading**

Update the load function to use RPC functions and add new metrics:

```typescript
// Replace existing totalUsers fetch with RPC
const { data: userStats } = await adminClient.rpc('count_platform_users');

// Add signup trend
const { data: signupTrend } = await adminClient.rpc('daily_signups_last_30_days');

// Add subscription breakdown
const { data: orgTiers } = await adminClient
  .from('organizations')
  .select('subscription_tier, gift_tier')
  .is('demo_type', null);

const tierCounts = { free: 0, team: 0, unit: 0 };
for (const org of orgTiers ?? []) {
  const effectiveTier = org.gift_tier ?? org.subscription_tier ?? 'free';
  tierCounts[effectiveTier as keyof typeof tierCounts]++;
}

// Add pending feedback count
const { count: pendingFeedback } = await adminClient
  .from('beta_feedback')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'new');

// Recent activity from audit_logs (not admin_audit_log)
const { data: recentActivity } = await adminClient
  .from('audit_logs')
  .select('*')
  .order('timestamp', { ascending: false })
  .limit(10);
```

Return all of these in the load function's return object.

- [ ] **Step 3: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin/+page.server.ts
git commit -m "feat(admin): enhance dashboard data with RPC stats, trends, tier counts"
```

---

### Task 10: Enhance dashboard UI with charts and activity feed

**Files:**
- Modify: `src/routes/admin/+page.svelte`

- [ ] **Step 1: Redesign the dashboard page**

Replace the existing dashboard UI with:

1. **4 stat cards** in a grid:
   - Total Users (with % change)
   - Organizations (with new this month)
   - Paid Subscriptions (with Team/Unit breakdown)
   - Pending (access requests + feedback count, clickable)

2. **Signup trend** (CSS bar chart):
   - Map `signupTrend` data to percentage-height divs
   - Max height = tallest day, others proportional

3. **Subscription mix** (horizontal bars):
   - Three bars: Free, Team, Unit with counts

4. **Recent activity feed**:
   - List of last 10 audit events with timestamp, action, user email

Use CSS variables for all colors/spacing. No charting library.

The stat card pattern:
```svelte
<div class="stat-card">
  <div class="stat-label">Total Users</div>
  <div class="stat-value">{data.userStats?.total ?? 0}</div>
  <div class="stat-change" class:positive={percentChange > 0}>
    {percentChange > 0 ? '↑' : '↓'} {Math.abs(percentChange)}% this month
  </div>
</div>
```

The bar chart pattern:
```svelte
<div class="trend-bars">
  {#each data.signupTrend ?? [] as day}
    <div
      class="trend-bar"
      style="height: {(day.count / maxCount) * 100}%"
      title="{day.date}: {day.count} signups"
    ></div>
  {/each}
</div>
```

- [ ] **Step 2: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin/+page.svelte
git commit -m "feat(admin): redesign dashboard with trend charts, stats, activity feed"
```

---

## Chunk 4: Organizations Pages

### Task 11: Create organizations list page

**Files:**
- Create: `src/routes/admin/organizations/+page.server.ts`
- Create: `src/routes/admin/organizations/+page.svelte`

- [ ] **Step 1: Create the server loader**

Create `src/routes/admin/organizations/+page.server.ts`:

```typescript
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAdminRole, canAccessPage } from '$lib/server/admin';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
  const { user, supabase } = locals;
  if (!user) throw error(401, 'Not authenticated');

  const role = await getAdminRole(supabase, user.id);
  if (!role || !canAccessPage(role, 'organizations')) throw error(403, 'Not authorized');

  const adminClient = getAdminClient();

  const { data: orgs } = await adminClient
    .from('organizations')
    .select('id, name, subscription_tier, gift_tier, suspended_at, created_at, demo_type')
    .is('demo_type', null)
    .order('created_at', { ascending: false });

  // Enrich with member counts and personnel counts
  const enrichedOrgs = await Promise.all(
    (orgs ?? []).map(async (org) => {
      const { count: memberCount } = await adminClient
        .from('organization_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);

      const { count: personnelCount } = await adminClient
        .from('personnel')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .is('archived_at', null);

      // Get owner email
      const { data: ownerMembership } = await adminClient
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', org.id)
        .eq('role', 'owner')
        .single();

      let ownerEmail = '';
      if (ownerMembership) {
        const { data: { user: ownerUser } } = await adminClient.auth.admin.getUserById(ownerMembership.user_id);
        ownerEmail = ownerUser?.email ?? '';
      }

      return {
        ...org,
        effectiveTier: org.gift_tier ?? org.subscription_tier ?? 'free',
        memberCount: memberCount ?? 0,
        personnelCount: personnelCount ?? 0,
        ownerEmail,
        isSuspended: !!org.suspended_at
      };
    })
  );

  return { organizations: enrichedOrgs };
};
```

- [ ] **Step 2: Create the page component**

Create `src/routes/admin/organizations/+page.svelte`:

Table with columns: Name (link to detail), Tier badge, Members, Personnel, Owner, Status (active/suspended), Created.

Include search input and tier/status filter dropdowns.

Use existing CSS patterns (`.btn`, `.input`, `.select`, Badge component).

- [ ] **Step 3: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin/organizations/+page.server.ts src/routes/admin/organizations/+page.svelte
git commit -m "feat(admin): add organizations list page with search and filters"
```

---

### Task 12: Create organization detail page

**Files:**
- Create: `src/routes/admin/organizations/[orgId]/+page.server.ts`
- Create: `src/routes/admin/organizations/[orgId]/+page.svelte`
- Create: `src/lib/components/admin/SuspendModal.svelte`
- Create: `src/lib/components/admin/TransferOwnershipModal.svelte`

- [ ] **Step 1: Create SuspendModal component**

Create `src/lib/components/admin/SuspendModal.svelte`:

Props: `type: 'user' | 'org'`, `targetId: string`, `targetName: string`, `isSuspended: boolean`, `onClose: () => void`, `onComplete: () => void`

Modal with:
- Title: "Suspend {name}" or "Unsuspend {name}"
- Optional reason textarea
- Confirm/Cancel buttons
- POSTs to `/admin/api/suspend` with `{ type, targetId, action: 'suspend'|'unsuspend', reason }`

Use the existing Modal component wrapper.

- [ ] **Step 2: Create TransferOwnershipModal component**

Create `src/lib/components/admin/TransferOwnershipModal.svelte`:

Props: `orgId: string`, `orgName: string`, `members: Array<{userId: string, email: string, role: string}>`, `onClose: () => void`, `onComplete: () => void`

Modal with:
- Select dropdown of org members (excluding current owner)
- Text input: "Type the org name to confirm"
- Confirm button disabled until org name matches
- POSTs to org detail form action

- [ ] **Step 3: Create the org detail server loader and actions**

Create `src/routes/admin/organizations/[orgId]/+page.server.ts`:

Load function fetches:
- Org record (name, tier, suspended_at, created_at, gift_tier, gift_expires_at, subscription_tier)
- Members with roles and emails
- Personnel count (active only)
- Subscription details
- Last 10 audit events for this org

Actions:
- `transferOwnership` — validate target is member, swap roles, audit log
- (Suspend/unsuspend uses the shared API endpoint from Task 13)

- [ ] **Step 4: Create the org detail page component**

Create `src/routes/admin/organizations/[orgId]/+page.svelte`:

Layout matches the mockup:
- Header: org name, created date, member/personnel counts, tier + status badges
- Quick actions bar: Gift Tier, Transfer Ownership, Suspend/Unsuspend buttons
- Subscription card: grid of tier, status, personnel/cap, billing info
- Members list: email (linked to user detail), role
- Recent audit events: timestamp, action, user

- [ ] **Step 5: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin/organizations/[orgId]/ src/lib/components/admin/SuspendModal.svelte src/lib/components/admin/TransferOwnershipModal.svelte
git commit -m "feat(admin): add org detail page with actions and modals"
```

---

### Task 13: Create suspend/unsuspend API endpoint

**Files:**
- Create: `src/routes/admin/api/suspend/+server.ts`
- Create: `src/tests/admin/suspension.test.ts`

- [ ] **Step 1: Write failing tests for suspension validation**

Create `src/tests/admin/suspension.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateSuspendRequest } from '$lib/server/admin';

describe('validateSuspendRequest', () => {
  it('accepts valid suspend request', () => {
    const result = validateSuspendRequest({
      type: 'user',
      targetId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'suspend',
      reason: 'Violation of terms'
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid unsuspend request', () => {
    const result = validateSuspendRequest({
      type: 'org',
      targetId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'unsuspend'
    });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid type', () => {
    const result = validateSuspendRequest({
      type: 'group',
      targetId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'suspend'
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid UUID', () => {
    const result = validateSuspendRequest({
      type: 'user',
      targetId: 'not-a-uuid',
      action: 'suspend'
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid action', () => {
    const result = validateSuspendRequest({
      type: 'user',
      targetId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'delete'
    });
    expect(result.valid).toBe(false);
  });

  it('sanitizes reason string', () => {
    const result = validateSuspendRequest({
      type: 'user',
      targetId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'suspend',
      reason: '  some reason  '
    });
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('some reason');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/admin/suspension.test.ts`
Expected: FAIL — `validateSuspendRequest` not defined.

- [ ] **Step 3: Implement validateSuspendRequest in admin.ts**

Add to `src/lib/server/admin.ts`:

```typescript
import { validateUUID } from './validation';

interface SuspendRequest {
  type: string;
  targetId: string;
  action: string;
  reason?: string;
}

interface SuspendValidation {
  valid: boolean;
  type?: 'user' | 'org';
  targetId?: string;
  action?: 'suspend' | 'unsuspend';
  reason?: string;
  error?: string;
}

export function validateSuspendRequest(req: SuspendRequest): SuspendValidation {
  if (!req.type || !['user', 'org'].includes(req.type)) {
    return { valid: false, error: 'Invalid type' };
  }
  if (!req.targetId || !validateUUID(req.targetId)) {
    return { valid: false, error: 'Invalid target ID' };
  }
  if (!req.action || !['suspend', 'unsuspend'].includes(req.action)) {
    return { valid: false, error: 'Invalid action' };
  }
  return {
    valid: true,
    type: req.type as 'user' | 'org',
    targetId: req.targetId,
    action: req.action as 'suspend' | 'unsuspend',
    reason: req.reason?.trim() || undefined
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/admin/suspension.test.ts`
Expected: All PASS.

- [ ] **Step 5: Create the suspend API endpoint**

Create `src/routes/admin/api/suspend/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPlatformAdmin, getAdminRole, validateSuspendRequest } from '$lib/server/admin';
import { getAdminClient } from '$lib/server/supabase';
import { auditLog, getRequestInfo } from '$lib/server/auditLog';

export const POST: RequestHandler = async (event) => {
  const { locals } = event;
  const { user, supabase } = locals;
  if (!user) throw error(401, 'Not authenticated');

  const role = await getAdminRole(supabase, user.id);
  if (role !== 'super_admin') throw error(403, 'Only super admins can suspend');

  const body = await event.request.json();
  const validation = validateSuspendRequest(body);
  if (!validation.valid) throw error(400, validation.error ?? 'Invalid request');

  const adminClient = getAdminClient();
  const { type, targetId, action, reason } = validation;

  if (type === 'user') {
    if (action === 'suspend') {
      const { error: dbError } = await adminClient
        .from('user_suspensions')
        .upsert({ user_id: targetId, suspended_by: user.id, reason });
      if (dbError) throw error(500, 'Operation failed');
    } else {
      const { error: dbError } = await adminClient
        .from('user_suspensions')
        .delete()
        .eq('user_id', targetId);
      if (dbError) throw error(500, 'Operation failed');
    }
  } else {
    if (action === 'suspend') {
      const { error: dbError } = await adminClient
        .from('organizations')
        .update({ suspended_at: new Date().toISOString() })
        .eq('id', targetId);
      if (dbError) throw error(500, 'Operation failed');
    } else {
      const { error: dbError } = await adminClient
        .from('organizations')
        .update({ suspended_at: null })
        .eq('id', targetId);
      if (dbError) throw error(500, 'Operation failed');
    }
  }

  await auditLog({
    action: `${action}_${type}`,
    resourceType: type === 'user' ? 'user' : 'organization',
    resourceId: targetId,
    details: { reason },
    severity: 'critical'
  }, getRequestInfo(event));

  return json({ success: true });
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/admin.ts src/tests/admin/suspension.test.ts src/routes/admin/api/suspend/+server.ts
git commit -m "feat(admin): add suspend/unsuspend API with validation and audit logging"
```

---

## Chunk 5: User Detail Enhancement & Subscriptions Page

### Task 14: Enhance user detail page with actions and activity

**Files:**
- Modify: `src/routes/admin/users/[userId]/+page.server.ts`
- Modify: `src/routes/admin/users/[userId]/+page.svelte`

- [ ] **Step 1: Read existing user detail files**

Read both `+page.server.ts` and `+page.svelte` to understand current structure.

- [ ] **Step 2: Enhance server loader with suspension status and activity**

Add to the load function:

```typescript
// Check suspension status
const { data: suspension } = await adminClient
  .from('user_suspensions')
  .select('*')
  .eq('user_id', userId)
  .maybeSingle();

// Recent activity from audit_logs
const { data: recentActivity } = await adminClient
  .from('audit_logs')
  .select('*')
  .eq('user_id', userId)
  .order('timestamp', { ascending: false })
  .limit(10);

// Get last_sign_in_at from auth
const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(userId);
```

Add to return: `suspension`, `recentActivity`, `lastSignIn: authUser?.last_sign_in_at`

Add form actions:
- `resetPassword` — calls `adminClient.auth.admin.generateLink({ type: 'recovery', email })`, audit logs it
- `resendInvite` — re-sends invite email if user hasn't confirmed

- [ ] **Step 3: Enhance user detail UI**

Update `+page.svelte`:
- Header with avatar circle (initials from email), email, join date, last sign-in, status badge
- Quick actions bar: Send Password Reset, Resend Invite, Suspend/Unsuspend (using SuspendModal)
- Organizations section: list with org name (linked), role, personnel count, tier badge
- Recent Activity section: timestamp, action, org context from audit_logs

- [ ] **Step 4: Add suspension status to users list page**

In `src/routes/admin/users/+page.svelte`, add a "Status" column showing ACTIVE or SUSPENDED badge.

The server loader in `src/routes/admin/users/+page.server.ts` needs to fetch suspension data:

```typescript
const { data: suspensions } = await adminClient
  .from('user_suspensions')
  .select('user_id');
const suspendedIds = new Set((suspensions ?? []).map(s => s.user_id));
```

Pass `suspendedIds` to the page and use it to show status badges.

- [ ] **Step 5: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin/users/
git commit -m "feat(admin): enhance user detail with actions, activity, suspension status"
```

---

### Task 15: Create subscriptions overview page

**Files:**
- Create: `src/routes/admin/subscriptions/+page.server.ts`
- Create: `src/routes/admin/subscriptions/+page.svelte`

- [ ] **Step 1: Create the server loader**

Create `src/routes/admin/subscriptions/+page.server.ts`:

Load all orgs with subscription data:
- Org name, subscription_tier, gift_tier, gift_expires_at, suspended_at
- Owner email (via membership + auth admin)
- Personnel count vs cap
- Payment status (if Stripe data available)

Filter out demo orgs. Support tier/status filtering and text search via URL params.
Paginate at 20 per page.

Access check: `canAccessPage(role, 'subscriptions')`

- [ ] **Step 2: Create the page component**

Create `src/routes/admin/subscriptions/+page.svelte`:

Table with columns: Org (linked), Tier badge, Status badge, Personnel (count/cap), Owner, Next Billing.

Filter controls: tier dropdown, status dropdown, text search input.

Pagination: prev/next with page indicator.

Use existing CSS patterns.

- [ ] **Step 3: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin/subscriptions/
git commit -m "feat(admin): add subscriptions overview page with filters"
```

---

## Chunk 6: Announcements System

### Task 16: Create announcements admin page

**Files:**
- Create: `src/routes/admin/announcements/+page.server.ts`
- Create: `src/routes/admin/announcements/+page.svelte`
- Create: `src/tests/admin/announcements.test.ts`

- [ ] **Step 1: Write failing tests for announcement validation**

Create `src/tests/admin/announcements.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateAnnouncement } from '$lib/server/admin';

describe('validateAnnouncement', () => {
  it('accepts valid announcement', () => {
    const result = validateAnnouncement({
      title: 'Maintenance Window',
      message: 'System will be down Saturday 2-4am EST.',
      type: 'maintenance'
    });
    expect(result.valid).toBe(true);
    expect(result.title).toBe('Maintenance Window');
  });

  it('rejects empty title', () => {
    const result = validateAnnouncement({ title: '', message: 'test', type: 'info' });
    expect(result.valid).toBe(false);
  });

  it('rejects title over 200 chars', () => {
    const result = validateAnnouncement({ title: 'a'.repeat(201), message: 'test', type: 'info' });
    expect(result.valid).toBe(false);
  });

  it('rejects empty message', () => {
    const result = validateAnnouncement({ title: 'test', message: '', type: 'info' });
    expect(result.valid).toBe(false);
  });

  it('rejects message over 1000 chars', () => {
    const result = validateAnnouncement({ title: 'test', message: 'a'.repeat(1001), type: 'info' });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = validateAnnouncement({ title: 'test', message: 'test', type: 'error' });
    expect(result.valid).toBe(false);
  });

  it('accepts valid expiry date', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const result = validateAnnouncement({ title: 'test', message: 'test', type: 'info', expiresAt: future });
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBe(future);
  });

  it('allows null expiry', () => {
    const result = validateAnnouncement({ title: 'test', message: 'test', type: 'info' });
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/admin/announcements.test.ts`
Expected: FAIL — `validateAnnouncement` not defined.

- [ ] **Step 3: Implement validateAnnouncement in admin.ts**

Add to `src/lib/server/admin.ts`:

```typescript
interface AnnouncementInput {
  title: string;
  message: string;
  type: string;
  expiresAt?: string;
}

interface AnnouncementValidation {
  valid: boolean;
  title?: string;
  message?: string;
  type?: 'info' | 'warning' | 'maintenance';
  expiresAt?: string;
  error?: string;
}

export function validateAnnouncement(input: AnnouncementInput): AnnouncementValidation {
  const title = input.title?.trim();
  const message = input.message?.trim();

  if (!title || title.length === 0) return { valid: false, error: 'Title is required' };
  if (title.length > 200) return { valid: false, error: 'Title must be 200 characters or less' };
  if (!message || message.length === 0) return { valid: false, error: 'Message is required' };
  if (message.length > 1000) return { valid: false, error: 'Message must be 1000 characters or less' };
  if (!['info', 'warning', 'maintenance'].includes(input.type)) {
    return { valid: false, error: 'Invalid announcement type' };
  }

  return {
    valid: true,
    title,
    message,
    type: input.type as 'info' | 'warning' | 'maintenance',
    expiresAt: input.expiresAt || undefined
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/admin/announcements.test.ts`
Expected: All PASS.

- [ ] **Step 5: Create the announcements server loader and actions**

Create `src/routes/admin/announcements/+page.server.ts`:

Load: all announcements ordered by created_at desc.

Actions:
- `create` — validate input, insert into `platform_announcements`, audit log
- `toggle` — toggle `is_active`, set `updated_by`, audit log
- `delete` — hard delete by id, audit log

Access check: `role === 'super_admin'` only.

- [ ] **Step 6: Create the announcements page component**

Create `src/routes/admin/announcements/+page.svelte`:

- "Create Announcement" button → opens inline form or modal
- Form: title input, message textarea, type dropdown (info/warning/maintenance), optional expiry date picker
- List of announcements: title, type badge, status (active/expired/inactive), created date
- Toggle active/inactive button per item
- Delete button per item (with confirmation)

- [ ] **Step 7: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/admin.ts src/tests/admin/announcements.test.ts src/routes/admin/announcements/
git commit -m "feat(admin): add announcements management page with validation"
```

---

### Task 17: Create user-facing announcement banner

**Files:**
- Create: `src/lib/components/AnnouncementBanner.svelte`
- Modify: `src/routes/org/[orgId]/+layout.server.ts`
- Modify: `src/routes/org/[orgId]/+layout.svelte`

- [ ] **Step 1: Add announcement loading to org layout server**

In `src/routes/org/[orgId]/+layout.server.ts`, add a query for active announcements:

```typescript
// Load active, non-expired announcements
const { data: announcements } = await supabase
  .from('platform_announcements')
  .select('id, title, message, type')
  .eq('is_active', true)
  .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  .order('type', { ascending: false }); // maintenance (last enum value) first via DESC

// Filter out dismissed ones
const { data: dismissals } = await supabase
  .from('announcement_dismissals')
  .select('announcement_id')
  .eq('user_id', user.id);

const dismissedIds = new Set((dismissals ?? []).map(d => d.announcement_id));
const activeAnnouncements = (announcements ?? []).filter(a => !dismissedIds.has(a.id));
```

Add `activeAnnouncements` to the return object.

- [ ] **Step 2: Create the AnnouncementBanner component**

Create `src/lib/components/AnnouncementBanner.svelte`:

```svelte
<script lang="ts">
  interface Announcement {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'maintenance';
  }

  let { announcements }: { announcements: Announcement[] } = $props();

  async function dismiss(id: string) {
    await fetch(`/api/announcements/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcementId: id })
    });
    announcements = announcements.filter(a => a.id !== id);
  }

  const typeColors: Record<string, { bg: string; border: string; text: string }> = {
    info: { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
    warning: { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
    maintenance: { bg: '#ffebee', border: '#f44336', text: '#c62828' }
  };
</script>

{#each announcements as announcement}
  {@const colors = typeColors[announcement.type] ?? typeColors.info}
  <div
    class="announcement-banner"
    style="background: {colors.bg}; border-color: {colors.border}; color: {colors.text};"
    role="alert"
  >
    <div class="announcement-content">
      <strong>{announcement.title}</strong>
      <span>{announcement.message}</span>
    </div>
    <button
      class="announcement-dismiss"
      onclick={() => dismiss(announcement.id)}
      aria-label="Dismiss announcement"
      style="color: {colors.text};"
    >✕</button>
  </div>
{/each}

<style>
  .announcement-banner {
    display: flex;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border-left: 4px solid;
    margin-bottom: 1px;
  }

  .announcement-content {
    flex: 1;
    font-size: var(--font-size-sm);
  }

  .announcement-content strong {
    margin-right: var(--spacing-sm);
  }

  .announcement-dismiss {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    padding: var(--spacing-xs);
    opacity: 0.7;
  }

  .announcement-dismiss:hover {
    opacity: 1;
  }
</style>
```

- [ ] **Step 3: Create dismiss API endpoint**

Create `src/routes/api/announcements/dismiss/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateUUID } from '$lib/server/validation';

export const POST: RequestHandler = async ({ locals, request }) => {
  const { user, supabase } = locals;
  if (!user) throw error(401, 'Not authenticated');

  const { announcementId } = await request.json();
  if (!announcementId || !validateUUID(announcementId)) {
    throw error(400, 'Invalid announcement ID');
  }

  await supabase
    .from('announcement_dismissals')
    .upsert({ announcement_id: announcementId, user_id: user.id });

  return json({ success: true });
};
```

- [ ] **Step 4: Add banner to org layout**

In `src/routes/org/[orgId]/+layout.svelte`, import and render the banner above the main content:

```svelte
import AnnouncementBanner from '$lib/components/AnnouncementBanner.svelte';

<!-- Above the main page content slot -->
{#if data.activeAnnouncements?.length}
  <AnnouncementBanner announcements={data.activeAnnouncements} />
{/if}
```

- [ ] **Step 5: Verify no type errors**

Run: `npm run check`
Expected: No new type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/AnnouncementBanner.svelte src/routes/org/[orgId]/+layout.server.ts src/routes/org/[orgId]/+layout.svelte src/routes/api/announcements/dismiss/+server.ts
git commit -m "feat(admin): add user-facing announcement banners with dismissal"
```

---

## Chunk 7: Final Integration & Verification

### Task 18: Type check and build verification

- [ ] **Step 1: Run type check**

Run: `npm run check`
Expected: No new type errors (pre-existing ones are acceptable).

- [ ] **Step 2: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass (including new admin tests).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Fix any issues found**

Address any type errors, test failures, or build errors.

- [ ] **Step 5: Commit fixes if any**

```bash
git add -A
git commit -m "fix(admin): resolve type/build issues from admin redesign"
```

---

### Task 19: Update changelog

**Files:**
- Modify: `src/lib/data/changelog.ts`

- [ ] **Step 1: Add changelog entry for the admin redesign**

Add an entry to the changelog:

```typescript
{
  date: '2026-03-13',
  title: 'Platform Admin Overhaul',
  items: [
    'Platform announcements — important messages from the team will now appear as banners at the top of the page. You can dismiss them when you\'re done reading.'
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/changelog.ts
git commit -m "docs: add changelog entry for admin panel redesign"
```
