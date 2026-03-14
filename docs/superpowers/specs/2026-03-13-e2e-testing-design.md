# E2E Testing Design Spec

## Overview

Add end-to-end testing to TroopToTask using Playwright, running against the local Supabase instance. The goal is a regression safety net covering critical user flows, structured for future CI integration.

## Decisions

- **Framework**: Playwright (official SvelteKit recommendation, best async/SPA support)
- **Architecture**: Page Object Model (POM) — page objects encapsulate selectors and interactions, fixtures handle auth
- **Test target**: Local Supabase (`127.0.0.1:54321`) + SvelteKit dev server (`localhost:5173`)
- **Auth strategy**: Hybrid — one suite tests login UI, all others use programmatic auth via Supabase Admin API
- **CI**: Designed to be CI-ready but CI pipeline is a follow-up task
- **Browsers**: Chromium only to start
- **Parallelism**: Serial (1 worker) to avoid DB state conflicts

## Project Structure

```
e2e/
  global-setup.ts        # Playwright globalSetup: creates test users, org, seed data
  global-teardown.ts     # Playwright globalTeardown: cleans up test users, org, data
  fixtures/
    auth.ts              # Playwright fixtures for role-based authenticated sessions (uses storageState)
    supabase.ts          # Supabase admin client (service role) for setup/teardown
  .auth/                 # storageState files per role (owner.json, admin.json, member.json)
  pages/
    LoginPage.ts         # Login form interactions
    DashboardPage.ts     # Post-login landing
    PersonnelPage.ts     # Personnel list, add/edit/archive
    CalendarPage.ts      # Calendar navigation, status setting
    TrainingPage.ts      # Training records and matrix
    AdminPage.ts         # Admin hub: approvals, archived, settings
    LeadersBookPage.ts   # Counseling records
  specs/
    auth.spec.ts
    personnel.spec.ts
    calendar.spec.ts
    training.spec.ts
    permissions.spec.ts
    admin.spec.ts
    leaders-book.spec.ts
    bulk-import.spec.ts
  playwright.config.ts
```

## Dependencies

- `@playwright/test` (dev dependency)

## npm Scripts

- `test:e2e` — run all e2e tests headless
- `test:e2e:ui` — open Playwright UI mode for debugging
- `test:e2e:headed` — run with visible browser

## Playwright Config

- `baseURL`: `http://localhost:5173`
- `testDir`: `./e2e/specs`
- `retries`: 0 locally, 2 in CI (via `process.env.CI`)
- `workers`: 1
- `use.trace`: `on-first-retry`
- `use.screenshot`: `only-on-failure`
- `globalSetup`: `./e2e/global-setup.ts`
- `globalTeardown`: `./e2e/global-teardown.ts`
- `webServer`: starts `npm run dev` automatically if not already running
- Note: CI should use `npm run build && npm run preview` instead of dev server

## Environment Variables

Tests rely on the same `.env.local` used for local development:
- `PUBLIC_SUPABASE_URL` — `http://127.0.0.1:54321`
- `PUBLIC_SUPABASE_ANON_KEY` — local Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — local Supabase service role key (needed for admin API in global setup)

No separate `.env.test` needed — local Supabase defaults are sufficient.

## Rate Limiting

The app applies rate limiting in `hooks.server.ts` on every request. Rapid test execution from `127.0.0.1` would trigger 429 responses.

**Solution**: Skip rate limiting when `E2E_TESTING=true` environment variable is set. Implementation: add an early return in `src/hooks.server.ts` before the `checkRateLimit` call, double-gated behind `import.meta.env.DEV` so it is tree-shaken out of production builds and cannot be exploited.

## Authentication

### Test Users

Created via Supabase Admin API in `e2e/global-setup.ts`, not in the seed file. Cleaned up in `e2e/global-teardown.ts`.

| User | Email | Role | Purpose |
|------|-------|------|---------|
| Owner | `e2e-owner@test.local` | `owner` | Full access, destructive ops |
| Admin | `e2e-admin@test.local` | `admin` | Admin features, no transfer/delete org |
| Member | `e2e-member@test.local` | `member` | Limited permissions, scoped access |

Password for all: `E2eTestPass123!`

### Test Organization

Created in global setup alongside users via direct Supabase DB inserts (service role):
1. Insert org into `organizations` table
2. Insert `organization_members` rows linking each test user to the org with correct roles:
   - Owner user → `role: 'owner'`
   - Admin user → `role: 'admin'`
   - Member user → `role: 'member'`, `scoped_group_id` set to a test group
3. Insert a test group into `groups` table (for member scoping)
4. Insert known status types, training types into their tables
5. Insert a handful of seed personnel for predictable assertions

### Programmatic Login Fixture

```ts
// Each role is a separate Playwright fixture
test('can add personnel', async ({ ownerPage }) => {
  // ownerPage is already authenticated as owner, navigated to test org
});
```

Mechanism:
1. Navigate to the login page
2. Use `page.evaluate()` to call `supabase.auth.signInWithPassword()` inside the browser context — this ensures cookies are set correctly by `@supabase/ssr` in the native cookie format (chunked `sb-<ref>-auth-token` cookies)
3. Save the authenticated state via Playwright's `storageState` so it can be reused across tests without re-authenticating
4. Navigate to the test org URL

Note: Supabase SSR uses dynamically named, chunked cookies based on the project ref. We must authenticate inside the browser context (not Node.js) so the cookie format matches what `createBrowserClient` and the server hook's `getUser()` expect.

### UI Login Test

One dedicated suite (`auth.spec.ts`) tests the actual login form flow. All other suites use programmatic auth.

## Page Object Pattern

```ts
export class PersonnelPage {
  constructor(private page: Page) {}

  async goto(orgId: string) {
    await this.page.goto(`/org/${orgId}/personnel`);
  }

  async openAddModal() { ... }
  async fillPersonnelForm(data: { firstName: string; lastName: string; rank?: string }) { ... }
  async savePersonnel() { ... }
  async selectPerson(name: string) { ... }

  async expectPersonnelVisible(name: string) { ... }
  async expectPersonnelCount(count: number) { ... }
}
```

Page objects built in priority order as each test suite is implemented.

## Selectors Strategy

- **Add `data-testid` attributes** to key interactive elements as tests are written
- Added incrementally per page object — not all at once
- Only on elements tests need to interact with (buttons, form fields, key containers)
- More resilient than CSS classes or IDs which can change during styling

Example: `<button data-testid="add-personnel-btn">Add Personnel</button>`

## Test Suites

### Priority 1: `auth.spec.ts`
- Login with valid credentials → redirects to dashboard
- Login with invalid password → shows error message
- Login with empty fields → shows validation error
- Logout → redirected to login page

### Priority 2: `personnel.spec.ts`
- Add a new person (fill form, save, verify in list)
- Edit an existing person (change name, save, verify)
- Archive a person (confirm dialog, verify removed from list)
- Search/filter personnel list

### Priority 3: `calendar.spec.ts`
- Set a person's status for a date (open modal, select type, save)
- Verify status appears on calendar
- Navigate between months
- View today's breakdown

### Priority 4: `training.spec.ts`
- Add a training record to a person
- View training matrix, verify record appears
- Edit/delete a training record

### Priority 5: `permissions.spec.ts`
- Member with limited permissions can't see admin link
- Member can't access admin routes directly (gets permission message)
- Scoped member only sees their group's personnel
- Owner/admin can access everything

### Priority 6: `admin.spec.ts`
- View pending approval requests
- Approve/deny a deletion request
- View archived personnel list
- Restore an archived person

### Priority 7: `leaders-book.spec.ts`
- Add a counseling record
- View/edit existing record
- Verify records appear under the right person

### Priority 8: `bulk-import.spec.ts` (defer if needed)
- Upload a valid CSV → preview step → confirm import
- Upload CSV with errors → shows validation errors

## Test Data Management

- **Global setup** creates the test org, users, and baseline data
- **Global teardown** cleans up in dependency order: test personnel/data → org members → groups/types → org → auth users (respects foreign key constraints)
- **Per-suite cleanup**: Tests that create data (e.g., add personnel) clean up after themselves in `afterEach` or `afterAll`
- **No database reseeding between tests** — start simple, add if flakiness becomes an issue

## CI Readiness (Future)

Designed for but not implementing GitHub Actions now. When ready:
- Workflow triggers on PR to `dev`
- Steps: checkout → setup Node → `supabase start` → seed DB → `npm run build` → `npx playwright test`
- Playwright config already supports `process.env.CI` for retry count
- CI should use `npm run build && npm run preview` (production build) rather than dev server
- `webServer` config in Playwright can start the preview server automatically
- Note: 24-hour session timeout (`last_sign_in_at` check in hooks) means global setup must always create fresh sessions, never reuse stale `storageState` files across CI runs

## .gitignore Additions

```
# Playwright
test-results/
playwright-report/
e2e/.auth/
```

## What This Does NOT Cover

- Unit tests (vitest) — separate concern, can add later
- Visual regression testing — overkill for now
- API-level testing — covered implicitly through UI flows
- Performance/load testing
- Mobile viewport testing (can add browser contexts later)
