# Site Admin Panel Redesign — Design Spec

## Overview

Redesign the platform-level admin panel (`/admin`) from a basic metrics dashboard into a support-centric operations hub. The primary workflow: someone contacts you with a problem → you search for them → you see everything → you act. All actions happen inline without losing context.

## Goals

- **Support-centric**: global search + unified customer views (user detail, org detail) as the primary workflow
- **Role-gated**: enforce `super_admin`, `support`, and `billing` role separation in both UI and server
- **Moderate analytics**: at-a-glance trend data without a charting library (CSS-only bars)
- **Suspend/ban**: ability to suspend users and orgs without deleting data
- **Announcements**: platform-wide banners for maintenance, features, and warnings
- **Preserve existing**: Access Requests, Feedback, Gifting, and Audit Log pages stay and are enhanced where noted

## Navigation & Page Structure

### Sidebar (grouped by function)

```
TroopToTask
Platform Admin
─────────────────
Dashboard

SUPPORT
  Users
  Organizations
  Access Requests   ← existing, kept as-is
  Feedback          ← existing, kept as-is

BILLING
  Subscriptions     ← new
  Gifting           ← existing, enhanced

SYSTEM
  Audit Log         ← existing, enhanced
  Announcements     ← new

─────────────────
← Exit Admin
```

### Role-Based Page Access

| Page            | super_admin | support | billing |
| --------------- | :---------: | :-----: | :-----: |
| Dashboard       |      ✓      |    ✓    |    ✓    |
| Users           |      ✓      |    ✓    |         |
| Organizations   |      ✓      |    ✓    |         |
| Access Requests |      ✓      |    ✓    |         |
| Feedback        |      ✓      |    ✓    |         |
| Subscriptions   |      ✓      |         |    ✓    |
| Gifting         |      ✓      |         |    ✓    |
| Audit Log       |      ✓      |         |         |
| Announcements   |      ✓      |         |         |

- Layout checks `adminRole` and only renders sidebar links the user has access to
- Each `+page.server.ts` also enforces role access server-side (defense-in-depth)
- Unauthorized access returns 403

## Global Search

A search bar at the top of every admin page (in the layout header).

- Searches both users (by email) and organizations (by name) simultaneously
- Results appear in a dropdown grouped by type: "Users" section and "Organizations" section
- User results show: email, org count
- Org results show: name, tier badge, personnel count
- Click a result → navigates to user/org detail page
- Minimum 3 characters to trigger search, debounced 300ms
- Server endpoint: `/admin/api/search` (GET, query param `q`)
- Search input validated and sanitized via `sanitizeString()` before use in queries
- Uses parameterized queries (Supabase `.ilike()`) — never string interpolation
- Rate limited, platform admin only
- Returns max 5 users + 5 orgs

## Dashboard (`/admin`)

### Stat Cards (top row, 4 cards)

1. **Total Users** — count via DB RPC function (not `listUsers` API, which caps at 1000), with % change from last month
2. **Organizations** — count of all orgs, with count of new this month
3. **Paid Subscriptions** — count of orgs on Team or Unit tier, with breakdown (e.g., "12 Team · 6 Unit")
4. **Pending** — count of pending access requests + count of new (unreviewed) feedback. Clicking jumps to the relevant page.

### Signup Trend (left, 2/3 width)

- Bar chart showing daily signups for the last 30 days
- CSS-only bars (colored divs with percentage heights), no charting library
- Computed server-side via a DB RPC function that groups signups by day (Supabase admin API has no aggregate queries)

### Subscription Mix (right, 1/3 width)

- Horizontal bar breakdown: Free / Team / Unit org counts
- CSS-only progress bars with labels and counts

### Recent Activity Feed (below charts)

- Last 10 platform-wide events from `audit_logs` table (canonical audit table — not `admin_audit_log` which is admin-panel-actions only)
- Shows: timestamp, action description, user email (if applicable)
- New feedback submissions also appear here
- Link to full Audit Log page

## User Detail Page (`/admin/users/[userId]`)

### Header

- Avatar circle (initials from email)
- Email address
- Join date, last sign-in timestamp (from Supabase `last_sign_in_at`)
- Status badge: ACTIVE or SUSPENDED

### Quick Actions Bar

Buttons rendered based on admin role:

- **Send Password Reset** — triggers Supabase auth password reset email (support, super_admin)
- **Resend Invite** — resends invite if they were invited but haven't confirmed (support, super_admin)
- **Suspend User** / **Unsuspend User** — toggles suspension (super_admin only)

All actions open a confirmation modal with optional reason field. All actions are audit-logged.

### Organizations Section

List of all orgs the user belongs to:

- Org name (clickable → org detail page)
- Role in that org (owner/admin/member)
- Personnel count
- Subscription tier badge

### Recent Activity Section

- Last 10 audit log entries for this user (filtered by `user_id`)
- Shows: timestamp, action, org context

## Organization Detail Page (`/admin/organizations/[orgId]`)

### Header

- Org name
- Created date, member count, personnel count
- Tier badge + status badge (ACTIVE/SUSPENDED)

### Quick Actions Bar

- **Gift Tier** — opens gift modal (billing, super_admin)
- **Transfer Ownership** — transfer org ownership to another member (super_admin only). Validation: target must be an existing member of the org; current owner is demoted to admin; cannot transfer if org is suspended. Requires typing org name to confirm.
- **Suspend Org** / **Unsuspend Org** — toggles suspension (super_admin only)

All actions open a confirmation modal with optional reason field. All actions are audit-logged.

### Subscription Card

Grid showing:

- Tier and price
- Status (active/past_due/canceled/gifted)
- Personnel count vs cap (e.g., "42 / 80")
- Subscription start date
- Gift status (active gift tier + expiry, or "None")
- Next billing date

### Members Section

List of all org members:

- Email (clickable → user detail page)
- Role (owner/admin/member)

### Recent Audit Events Section

- Last 10 audit log entries for this org (filtered by `organization_id`)

## Subscriptions Page (`/admin/subscriptions`)

Read-only overview table of all organizations with subscription data.

### Table Columns

- Org name (clickable → org detail)
- Tier (Free/Team/Unit)
- Status (active/past_due/canceled/gifted)
- Personnel (count / cap)
- Owner email
- Next billing date

### Features

- Filter by tier and status (dropdowns)
- Text search by org name or owner email
- Sortable columns
- Paginated (20 per page)
- No actions on this page — actions happen from org detail

### Access

- `super_admin` and `billing` roles only

## Suspend/Ban System

### User Suspension

- `user_suspensions` table: `user_id` (PK, FK to auth.users), `suspended_at`, `suspended_by` (FK to auth.users), `reason` (nullable text)
- Checked in `hooks.server.ts` via `is_user_suspended()` RPC — scoped to authenticated routes only (public pages like landing/login skip the check)
- Result cached in the request locals for the duration of the request (no repeated DB calls within a single page load)
- Suspended users see a full-page "Your account has been suspended. Contact support@trooptotask.com" message
- Org memberships stay intact (no data loss)
- Reversible via unsuspend action on user detail page (deletes the row)
- Suspension/unsuspension is audit-logged with optional reason

### Organization Suspension

- `suspended_at` timestamptz column on `organizations` table
- Enforced in two places:
  1. **Org layout** (`/org/[orgId]/+layout.server.ts`) — checks `suspended_at`, shows suspension page if set
  2. **API endpoints** under `/org/[orgId]/api/` — return 403 for suspended orgs
- All members of a suspended org see "This organization has been suspended" when navigating to it
- Other orgs the user belongs to continue working normally
- Org data stays intact, just inaccessible
- Reversible via unsuspend action on org detail page (sets `suspended_at` back to null)
- Suspension/unsuspension is audit-logged with optional reason

### No Delete from Admin Panel

- The admin panel only suspends, never deletes
- True deletion (if ever needed) is a direct database operation
- This prevents accidental irreversible damage from the UI

## Announcements System

### Database

`platform_announcements` table:

- `id` UUID primary key
- `title` text (required, max 200 chars)
- `message` text (required, max 1000 chars)
- `type` enum: `info` | `warning` | `maintenance`
- `is_active` boolean (default true)
- `expires_at` timestamptz (nullable — null means no auto-expiry)
- `created_by` UUID (FK to auth.users)
- `updated_by` UUID (FK to auth.users, nullable)
- `created_at` timestamptz
- `updated_at` timestamptz

`announcement_dismissals` table:

- `announcement_id` UUID (FK)
- `user_id` UUID (FK)
- `dismissed_at` timestamptz
- Primary key: (announcement_id, user_id)

### Admin Page (`/admin/announcements`)

- List of all announcements: title, type badge, status (active/expired/inactive), created date
- Create new announcement: title, message, type dropdown, optional expiry date
- Toggle active/inactive
- Delete (hard delete — announcements aren't sensitive data)
- `super_admin` only

### User-Facing Display

- Active, non-expired, non-dismissed announcements render as a banner at the top of the org layout (above page content)
- Banner color based on type: blue (info), amber (warning), red (maintenance)
- Dismiss button (X) on each banner — records dismissal per user
- Multiple active announcements stack vertically, ordered by severity (maintenance > warning > info)
- Loaded in the org layout server load function (query active announcements, exclude dismissed)

### What Announcements Are NOT

- Not a replacement for the "What's New" changelog (that's feature-focused, in-app)
- Not per-org notifications (those use the existing notification system)
- Platform-wide broadcasts only

## Feedback Enhancements

The existing Feedback page and FeedbackModal stay as-is. Enhancements:

- **Dashboard card**: "Pending Feedback" count (status = 'new') in the Pending stat card alongside access request count
- **Activity feed**: new feedback submissions appear in the dashboard's recent activity feed

## Database Changes

### New Tables

1. `platform_announcements` — as described above
2. `announcement_dismissals` — as described above

### Modified Tables

1. `organizations` — add `suspended_at` timestamptz nullable column

### User Suspension Storage

Option: `user_suspensions` table with `user_id`, `suspended_at`, `suspended_by`, `reason`

- Checked via RPC or join in hooks.server.ts
- Preferred over user_metadata because it's queryable and audit-friendly

### New DB Functions (RPC)

1. `count_platform_users()` — returns total user count and count of users created in the last 30 days (avoids `listUsers` API pagination ceiling)
2. `daily_signups_last_30_days()` — returns array of `{date, count}` for signup trend chart
3. `is_user_suspended(user_id)` — returns boolean, SECURITY DEFINER, used in hooks.server.ts

### RLS Policies

- `platform_announcements`: read by all authenticated users (needed for banner display), write by platform admins only
- `announcement_dismissals`: users can insert/read their own dismissals only
- `user_suspensions`: read/write by platform admins only (checked server-side via RPC)

## Security Considerations

- All new API endpoints enforce platform admin role checks server-side
- All admin actions are audit-logged via `auditLog()` helper
- All user input validated/sanitized via `src/lib/server/validation.ts`
- Global search is rate-limited
- Suspend/unsuspend/announce endpoints are rate-limited
- Suspension checks happen in `hooks.server.ts` (scoped to authenticated routes only, cached per-request)
- No PII logged to console
- Suspend actions require confirmation modal with optional reason
- Transfer ownership requires typing the org name to confirm

## Route Structure

```
src/routes/admin/
  +layout.server.ts          ← existing, add role-based page access map
  +layout.svelte             ← existing, update sidebar with grouped nav + role gating
  +page.server.ts            ← existing, enhance dashboard data
  +page.svelte               ← existing, enhance dashboard UI
  api/
    search/+server.ts        ← new, global search endpoint
  users/
    +page.server.ts          ← existing, keep
    +page.svelte             ← existing, keep
    [userId]/
      +page.server.ts        ← existing, enhance with activity + suspension
      +page.svelte           ← existing, enhance with actions + activity
  organizations/
    +page.server.ts          ← new
    +page.svelte             ← new
    [orgId]/
      +page.server.ts        ← new
      +page.svelte           ← new
  access-requests/
    +page.server.ts          ← existing, keep as-is
    +page.svelte             ← existing, keep as-is
  feedback/
    +page.server.ts          ← existing, keep as-is
    +page.svelte             ← existing, keep as-is
  subscriptions/
    +page.server.ts          ← new
    +page.svelte             ← new
  gifting/
    +page.server.ts          ← existing, keep
    +page.svelte             ← existing, keep
  audit/
    +page.server.ts          ← existing, keep
    +page.svelte             ← existing, keep
  announcements/
    +page.server.ts          ← new
    +page.svelte             ← new
```

## What Changes vs What Stays

### Stays As-Is

- Access Requests page (functionality unchanged)
- Feedback page (functionality unchanged, just dashboard integration)
- Gifting page (functionality unchanged)
- Audit Log page (functionality unchanged)
- Platform admin access control model (`platform_admins` table, `is_platform_admin()` RPC)

### Enhanced

- Dashboard (trend charts, subscription mix, pending counts, activity feed)
- Layout/sidebar (grouped sections, role-based visibility, global search)
- User detail page (quick actions, activity, suspension)
- Users list page (suspension status column)

### New

- Organizations list page
- Organization detail page
- Subscriptions overview page
- Announcements page + user-facing banner system
- Global search endpoint
- Suspend/unsuspend system (user + org)
