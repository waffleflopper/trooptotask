# Production Polish Design Spec

**Date:** 2026-03-12
**Scope:** Error pages, first-time user experience, OG/meta tags, `.single()` null audit, permission descriptions

---

## 1. Error Pages

### Root Error Page (`src/routes/+error.svelte`)
- Displays HTTP status code and friendly message
- Branded with app styling (uses CSS variables from app.css)
- "Go Home" button linking to `/`
- Handles common cases: 404 ("Page not found"), 403 ("You don't have permission"), 500 ("Something went wrong")

### Org-Scoped Error Page (`src/routes/org/[orgId]/+error.svelte`)
- Same branded layout
- "Back to Dashboard" button linking to `/org/{orgId}`
- Uses `$page.error` and `$page.status` from SvelteKit

### Behavior
- No layout dependencies — error pages should work even if layout load fails
- Minimal styling (inline or from app.css global styles already loaded)

---

## 2. First-Time User Experience — Getting Started Checklist

### Location
Persistent banner at the top of the org dashboard (`src/routes/org/[orgId]/+page.svelte`), rendered above the existing dashboard cards.

### Data Model
A new table `getting_started_progress` to track dismissal state:

```sql
CREATE TABLE getting_started_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE getting_started_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own getting started progress"
  ON getting_started_progress FOR ALL
  USING (auth.uid() = user_id);
```

### Auto-Tracked Steps (8 total)

Each step is derived from existing data loaded in the org layout or dashboard page server. New orgs start with zero status types, assignment types, and training types (no defaults are seeded by `create_org_with_owner`), so simple `length > 0` checks work for Steps 2-4.

| # | Step | Label | Completion Check | Link |
|---|------|-------|-----------------|------|
| 1 | Add personnel | "Add your first personnel" | `personnel.length > 0` | `/org/{orgId}/personnel` |
| 2 | Status types | "Set up your status types" | `statusTypes.length > 0` | `/org/{orgId}/calendar` (opens StatusTypeManager) |
| 3 | Assignment types | "Set up assignment types" | `assignmentTypes.length > 0` | `/org/{orgId}/calendar` (opens AssignmentTypeManager) |
| 4 | Training types | "Configure training types" | `trainingTypes.length > 0` | `/org/{orgId}/training` (opens TrainingTypeManager) |
| 5 | Onboarding template | "Set up your onboarding flow" | At least one onboarding template step exists | `/org/{orgId}/onboarding` |
| 6 | Rating scheme | "Configure your rating scheme" | At least one rating scheme entry exists | `/org/{orgId}/leaders-book` |
| 7 | Invite a member | "Invite a team member" | `orgMemberCount > 1` (more than just the creator) | `/org/{orgId}/settings` (member management) |
| 8 | Explore calendar | "Explore the calendar" | User has visited calendar page (tracked client-side via localStorage) | `/org/{orgId}/calendar` |

### Completion Detection Details

**Steps 1-2, 4**: Already available from org layout data (`personnel`, `statusTypes`, `trainingTypes` are loaded in `+layout.server.ts`).

**Step 3 (Assignment types)**: `assignmentTypes` is loaded in the dashboard page server (`+page.server.ts`), not from a client-side store. Pass `data.assignmentTypes.length` as the `assignmentTypeCount` prop.

**Step 5 (Onboarding template)**: Add a lightweight count query to the dashboard page server load: `SELECT COUNT(*) FROM onboarding_template_steps WHERE organization_id = $orgId`.

**Step 6 (Rating scheme)**: Add a lightweight count query to the dashboard page server load: `SELECT COUNT(*) FROM rating_scheme_entries WHERE organization_id = $orgId`.

**Step 7 (Invite member)**: Add query to dashboard page server load: `SELECT COUNT(*) FROM organization_memberships WHERE organization_id = $orgId`.

**Step 8 (Explore calendar)**: Tracked client-side via `localStorage.getItem('gettingStarted_calendarVisited_{orgId}')`. Set to `true` when user navigates to the calendar page. This avoids an extra DB field for a low-stakes step.

**Note on SSR for Step 8**: On server render, this step will always appear incomplete (localStorage not available). It will update client-side after hydration. This is acceptable since it's a low-stakes step and the flash is minimal.

### UI Design

```
┌─────────────────────────────────────────────────────┐
│  🚀 Getting Started                          [✕]   │
│  Complete these steps to set up your organization   │
│                                                     │
│  ✅ Add your first personnel                        │
│  ✅ Set up your status types                        │
│  ○  Set up assignment types          [Go →]         │
│  ○  Configure training types         [Go →]         │
│  ○  Set up your onboarding flow      [Go →]         │
│  ○  Configure your rating scheme     [Go →]         │
│  ○  Invite a team member             [Go →]         │
│  ○  Explore the calendar             [Go →]         │
│                                                     │
│  ████████░░░░░░░░░░  2 of 8 complete                │
└─────────────────────────────────────────────────────┘
```

- Completed steps show a green checkmark, incomplete show a circle
- Incomplete steps show a "Go →" link to the relevant page
- Progress bar at the bottom
- Dismiss button (✕) in the top right — asks "Are you sure? You can always find this in settings." and stores `dismissed_at` in the DB
- Only shown to owner and admin roles (members don't need to configure the org)
- Once all 8 steps are complete, the banner auto-hides and shows a toast via existing `toastStore.success()`: "You're all set! Your organization is configured."

### Component Structure

New component: `src/features/onboarding/components/GettingStartedBanner.svelte`

Props:
- `orgId: string`
- `personnel: PersonnelInfo[]`
- `statusTypes: StatusType[]`
- `trainingTypes: TrainingType[]`
- `assignmentTypeCount: number`
- `onboardingTemplateStepCount: number`
- `ratingSchemeEntryCount: number`
- `orgMemberCount: number`
- `dismissed: boolean`
- `onDismiss: () => void`

### API Endpoint

`src/routes/org/[orgId]/api/getting-started/+server.ts`
- `POST`: Create/update dismissal state (set `dismissed_at`). Uses upsert on the unique (organization_id, user_id) constraint.
- `DELETE`: Un-dismiss (clear `dismissed_at`, in case we add a "show again" option in settings). Checklist reappears with current completion state recalculated from live data — no stored step state to reset.

---

## 3. OG/Meta Tags for Landing Page

### Landing Page (`src/routes/+page.svelte`)

The landing page already has a `<title>` ("Troop to Task — Army Unit Personnel Management") and `<meta name="description">`. We are **replacing** the existing title/description with broader "Military" branding (not Army-specific) and **adding** OG + Twitter Card tags.

Update the existing `<svelte:head>` block:

```html
<title>Troop to Task — Military Unit Management</title>
<meta name="description" content="Modern military unit management software. Track personnel, training, availability, counseling, and daily assignments — all in one secure platform." />

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Troop to Task" />
<meta property="og:title" content="Troop to Task — Military Unit Management" />
<meta property="og:description" content="Modern military unit management software. Track personnel, training, availability, counseling, and daily assignments." />
<meta property="og:url" content="https://trooptotask.org" />
<meta property="og:image" content="https://trooptotask.org/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Troop to Task — Military Unit Management" />
<meta name="twitter:description" content="Modern military unit management software. Track personnel, training, availability, counseling, and daily assignments." />
<meta name="twitter:image" content="https://trooptotask.org/og-image.png" />
```

### OG Image
- Create a 1200x630px OG image (`static/og-image.png`)
- Should show the app name, tagline, and a simple visual (logo or dashboard screenshot)
- User will need to provide or approve the image design

### Other Public Pages
Add `<meta name="description">` to:
- `/privacy` — "Privacy policy for Troop to Task military unit management software."
- `/security` — "Security practices and NIST 800-171 compliance information for Troop to Task."
- `/help` — "Help and platform guide for Troop to Task."

---

## 4. `.single()` Null Check Audit

### Approach
Audit **every** `.single()` call in the codebase (~55 files). For each one, verify that the code checks for null/error before using the result. Fix any that don't.

Run `grep -rn '\.single()' src/` to get the full list. The known-safe and known-risky locations below are a starting point, not exhaustive.

### Known Safe (have null checks)
- `src/routes/org/[orgId]/+layout.server.ts:67` — org lookup, throws 404
- `src/lib/server/permissions.ts` — all membership lookups checked
- `src/routes/auth/register/+page.server.ts:51` — invite lookup checked
- `src/routes/org/[orgId]/billing/portal/+server.ts` — checked
- `src/routes/dashboard/+page.server.ts` — invitation/membership checked
- `src/lib/server/admin.ts:29` — checked

### Known Risky (need verification)
- `src/routes/org/[orgId]/settings/+page.server.ts` — multiple `.single()` calls
- `src/routes/org/[orgId]/api/onboarding/+server.ts`
- `src/routes/org/[orgId]/api/personnel-extended-info/+server.ts`
- `src/routes/org/[orgId]/api/export-excel/+server.ts`
- `src/routes/api/webhooks/stripe/+server.ts`
- `src/routes/org/[orgId]/api/availability/+server.ts`
- `src/routes/org/[orgId]/api/special-days/+server.ts`
- `src/routes/org/[orgId]/api/sign-in-rosters/` (3 files)
- `src/routes/org/[orgId]/api/daily-assignments/+server.ts`
- `src/routes/org/[orgId]/api/duty-roster-history/+server.ts`
- `src/routes/org/[orgId]/api/duty-roster-exemptions/+server.ts`
- `src/routes/org/[orgId]/api/pinned-groups/+server.ts`
- `src/routes/org/[orgId]/api/units/+server.ts`
- `src/routes/org/[orgId]/api/rating-scheme/+server.ts`
- `src/routes/org/[orgId]/api/calendar-reports/` (report endpoints)
- `src/routes/org/[orgId]/billing/` (3 files)
- `src/routes/admin/` (2 files)
- `src/routes/demo/+page.server.ts`
- `src/routes/api/platform-invites/+server.ts`
- Any `.single()` calls inside shared `crudFactory` patterns

### Fix Pattern
For each unguarded `.single()`:
```typescript
const { data, error } = await supabase.from('table').select('*').eq('id', id).single();
if (error || !data) {
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  // or: throw error(404, 'Not found');
}
```

---

## 5. Permission Descriptions in Member Management UI

### Location
`src/features/groups/components/OrganizationMemberManager.svelte` — the permission checkbox grid (lines ~305-401).

### Descriptions

Add a small help text line below each section heading:

| Section | Description |
|---------|-------------|
| Calendar | "View the unit calendar and personnel statuses. Edit allows setting statuses, assignments, and availability." |
| Personnel | "View the personnel roster and details. Edit allows adding, updating, and removing personnel records." |
| Training | "View training records and compliance status. Edit allows logging training completions and managing records." |
| Onboarding | "View onboarding progress for new personnel. Edit allows starting onboardings and updating step progress." |
| Leader's Book | "View counseling records and development goals. Edit allows creating and updating counseling entries." |
| Members | "Invite, remove, and manage permissions for other organization members. (Single toggle — no separate view-only option.)" |

### UI Treatment
- Small muted text below each section `<h4>`, using `font-size: var(--font-size-xs)` and `color: var(--color-text-muted)`
- No tooltip/hover — always visible when the custom permissions form is expanded
- Keeps the UI scannable without requiring interaction

```html
<div class="permission-section">
  <h4>Calendar</h4>
  <p class="permission-description">View the unit calendar and personnel statuses. Edit allows setting statuses, assignments, and availability.</p>
  <label class="checkbox-label">
    <input type="checkbox" ... /> View
  </label>
  <label class="checkbox-label">
    <input type="checkbox" ... /> Edit
  </label>
</div>
```

---

## Non-Goals

- Mobile responsiveness overhaul (separate effort)
- Automated test suite (separate effort)
- Error tracking/Sentry integration (separate effort)
- Navigation loading indicator (already exists)
- First-time user tour/walkthrough beyond the checklist
