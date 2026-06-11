# 007 - Restrict global admin search to support-authorized roles

Status: TODO
Priority: P1
Effort: S
Created: 2026-06-11
Audit commit: `c99874d0`

## Problem

The global admin search endpoint can return user emails and organization metadata through `src/routes/admin/api/search/+server.ts` without declaring an explicit role or page gate. The shared admin adapter supports role-gated routes, and the admin role model already keeps some admin pages away from billing-only users, but the search API currently bypasses that intent.

This is a confidentiality bug: a billing-only platform admin should not be able to query broad user or organization search results unless that role is intentionally granted support-style access.

## Evidence

- `src/routes/admin/api/search/+server.ts` calls `createSupabasePlatformAdministration(ctx).search(...)` through `adminHandle(...)` with no `requiredRole` or `page`.
- `src/lib/server/admin.ts` gives `billing` access to dashboard/subscription/billing/gifting surfaces, while `users` and `organizations` are `super_admin`/`support` only.
- `src/lib/server/adapters/adminAdapter.ts` already enforces `AdminRouteConfig.requiredRole` through `adminHandleCore(...)`.
- `src/lib/components/admin/AdminSearch.svelte` renders result details such as `user.email`, organization names, personnel counts, and subscription tier labels.

## Goal

Only `super_admin` and `support` admins can query the global admin search endpoint unless a future product decision creates a narrower billing-safe search result.

## Non-Goals

- Do not redesign the platform admin role model.
- Do not change the search result shape except as needed to prevent unauthorized access.
- Do not add new billing search behavior in this slice.
- Do not change unrelated admin pages or route policies.

## Files To Inspect

- `src/routes/admin/api/search/+server.ts`
- `src/lib/server/adapters/adminAdapter.ts`
- `src/lib/server/adapters/adminAdapter.test.ts`
- `src/lib/server/admin.ts`
- `src/lib/components/admin/AdminSearch.svelte`
- Admin layout files that render `AdminSearch.svelte`, only if a small UI hide is needed after the API is hardened.

## Implementation Plan

1. Add a failing authorization test.
   - Prefer a route-config level test for `src/routes/admin/api/search/+server.ts` if the project already exposes testable route configs for admin endpoints.
   - If no route test harness exists, export the search route config as a testable constant and keep `GET = adminHandle(searchConfig)`.
   - Assert that a `billing` admin receives a 403 or equivalent admin authorization error.
   - Assert that `support` and `super_admin` remain authorized.

2. Add an explicit role gate to the search endpoint.
   - In `src/routes/admin/api/search/+server.ts`, add `requiredRole: ['super_admin', 'support']` to the `adminHandle` config.
   - Keep the existing parse and search behavior unchanged for authorized roles.
   - Prefer explicit `requiredRole` here over a page alias so the endpoint policy is obvious at the call site.

3. Check the UI behavior for billing admins.
   - Inspect where `AdminSearch.svelte` is rendered.
   - If the existing layout has role or `accessiblePages` data available, hide the global search control for admins who cannot access either `users` or `organizations`.
   - Keep the UI change tiny. If hiding the control requires broad layout/data plumbing, stop and leave a note in this plan's completion comment instead of expanding the slice.

4. Update tests around the UI only if the UI was changed.
   - Add or update the smallest existing component/layout test that proves billing admins do not see a live global search control.
   - Do not add a large browser-only test for this plan unless the existing admin test setup already makes it cheap.

## Suggested Tests

Run the narrow tests first:

```bash
npm run test -- src/lib/server/adapters/adminAdapter.test.ts 'src/routes/admin/api/search/server.test.ts'
```

If a UI hide is added, run the relevant admin layout/component test as well.

Before marking complete, run the full repo gate:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

## Acceptance Criteria

- `src/routes/admin/api/search/+server.ts` declares an explicit `super_admin`/`support` authorization policy.
- A billing-only admin cannot execute the global search API.
- Support and super-admin search behavior remains unchanged.
- If the admin shell can cheaply hide the global search for billing admins, it does so without broad UI churn.
- All required verification commands pass.

## Risks And Notes

- The API hardening is the security boundary. UI hiding is usability polish and should not replace server enforcement.
- If product wants billing-safe search later, create a separate endpoint or result mode with an explicit contract instead of weakening this endpoint.
