# Leaders Book Redesign PRD

## Problem Statement

The current Leaders Book implementation is expensive and impractical. It loads the entire organization's training data, counseling records, development goals, extended info, availability, and status types upfront — before a user even clicks on a Soldier's card. The counseling system is overbuilt with signature tracking, status workflows, recurrence, and type management that don't match how Army leaders actually use counseling records. The development goals system has unnecessary complexity with categories, priorities, and target dates.

Leaders need a practical digital replacement for the traditional Army NCO's Leaders Book — a tool they pull up when sitting down to do administrative work on a single Soldier at a time. The current implementation tries to be a dashboard for the whole organization rather than a focused, per-Soldier administrative tool.

## Solution

Redesign the Leaders Book as a lightweight, two-level navigation:

1. A **personnel list page** that loads minimal data (just names, ranks, groups) and serves as a roster to select a Soldier.
2. A **per-Soldier record page** with a dedicated route and tabbed interface, fetching only that Soldier's data on demand.

The Soldier record page becomes the digital equivalent of a Soldier's section in an NCO's Leaders Book — containing their data sheet, counseling packet, development goals, and training snapshot. The counseling and goals systems are simplified to match how leaders actually use them.

Sensitive counseling data is protected by requiring edit-level permissions to even see the Counselings and Goals tabs.

## User Stories

1. As a team leader, I want to see a simple list of my Soldiers when I open the Leaders Book, so that I can quickly find and select the Soldier I need to work on.
2. As a team leader, I want to click a Soldier's name and navigate to their full record on a dedicated page, so that I can bookmark it and use the browser back button naturally.
3. As a team leader, I want to see a Soldier's current status and next upcoming status in the record header, so that I have situational awareness regardless of which tab I'm viewing.
4. As a team leader, I want a tabbed interface in a Soldier's record, so that I can quickly flip between their data sheet, counselings, goals, and training during an admin session.
5. As a team leader, I want the selected tab preserved in the URL, so that refreshing the page doesn't lose my place and I can share direct links to specific tabs.
6. As a team leader, I want to view and edit a Soldier Data Sheet with emergency contacts, spouse info, vehicle details, address, and personal contact info, so that I have critical reference information readily available.
7. As a team leader, I want to record a Soldier's ETS date, BASD, Date of Rank, and DEROS on their data sheet, so that I can track key military service dates.
8. As a team leader, I want to record a Soldier's marital status, number of dependents, and children's names and ages, so that I understand their family situation.
9. As a team leader, I want to record a Soldier's blood type, so that I have it on hand for field or emergency situations.
10. As a team leader, I want to record a Soldier's civilian education level, so that I can mentor them on career development.
11. As a team leader, I want to add and remove military education entries (BLC, ALC, Airborne, etc.) as a simple list, so that I know what schools they've completed.
12. As a team leader, I want to add leader notes to a Soldier's data sheet, so that I can capture anything not covered by the structured fields.
13. As a team leader, I want to add a counseling entry with a date and subject line, so that I can record that a counseling took place.
14. As a team leader, I want the counseling subject field to have placeholder text like "Event-Oriented: Late to PT" or "Initial: Duties & Expectations", so that I'm guided on the expected format without being constrained by a dropdown.
15. As a team leader, I want to optionally add notes to a counseling entry via an "Add Note" button, so that the form stays clean when I just need to log a counseling with a PDF.
16. As a team leader, I want to upload a signed counseling PDF (DA 4856 or equivalent) to a counseling entry, so that the official document is attached to the Soldier's record.
17. As a team leader, I want to see all of a Soldier's counseling entries in chronological order, so that I can review their counseling history during a session.
18. As a team leader, I want to set development goals for a Soldier with a title, short-term or long-term designation, and notes, so that I can track their professional development.
19. As a team leader, I want to mark a goal as done or not done, so that I can track completion simply.
20. As a team leader, I want to view a Soldier's training status snapshot showing all training types and their current/expired/warning status, so that I can see their training posture during a counseling session.
21. As an organization admin, I want counseling records and development goals hidden from users who only have view access to the Leaders Book, so that sensitive counseling data is protected from casual viewers.
22. As a view-only user, I want to see only the Data Sheet and Training tabs, so that I can reference administrative info without accessing counseling data.
23. As a group-scoped team leader, I want to only see personnel in my group on the Leaders Book list page, so that I'm focused on my Soldiers.
24. As a team leader on a phone or small laptop, I want the interface to work well on smaller screens, so that I can use it during a sit-down counseling session.
25. As a team leader, I want the personnel list to be searchable and filterable by group, so that I can quickly find a Soldier in a large organization.
26. As an admin, I want counseling PDF uploads stored securely with proper bucket RLS, so that only authorized users can access counseling documents.
27. As a team leader, I want to delete a counseling entry or goal, so that I can correct mistakes (subject to the existing deletion approval system for non-privileged users).
28. As a demo/sandbox user, I want to see sample Leaders Book data, so that I can evaluate the feature before committing to the platform.

## Implementation Decisions

### Architecture

- The Leaders Book becomes its own feature module separate from the counseling feature.
- Two-level routing: `/leaders-book` (personnel list) and `/leaders-book/[personnelId]` (Soldier record).
- The Soldier record page has its own `+page.server.ts` that fetches all data for that single Soldier in one request — no per-tab lazy loading needed since a single Soldier's data is small.
- The list page uses only personnel data already available from the org layout — no additional data fetching.
- Tab state is stored in URL query params (`?tab=data-sheet`). Default tab is Data Sheet.

### Tabbed Interface

- Tabs: **Data Sheet | Counselings | Goals | Training**
- Soldier record header (always visible): rank, name, group, MOS, current status + next upcoming status.
- Tab visibility is permission-controlled:
  - `canViewLeadersBook`: Data Sheet + Training tabs only
  - `canEditLeadersBook`: All four tabs (view AND edit access to Counselings + Goals)
  - Counselings and Goals tabs are completely hidden (not shown disabled) from view-only users.

### Schema Changes — `personnel_extended_info` (expand)

New columns:
- `ets_date` (date, nullable)
- `basd` (date, nullable)
- `date_of_rank` (date, nullable)
- `deros` (date, nullable)
- `marital_status` (text, nullable)
- `number_of_dependents` (integer, nullable)
- `children` (jsonb, nullable) — array of `{name: string, age: number}`
- `blood_type` (text, nullable)
- `civilian_education` (text, nullable)
- `military_education` (jsonb, nullable) — array of strings e.g. `["BLC", "ALC", "Airborne"]`

### Schema Changes — `counseling_records` (simplify)

Keep: `id`, `personnel_id`, `organization_id`, `date_conducted`, `subject`, `file_path`, `created_at`, `updated_at`
Rename/repurpose: collapse `key_points` + `plan_of_action` + existing `notes` into single `notes` (text, nullable)
Drop: `counseling_type_id`, `follow_up_date`, `status`, `counselor_signed`, `counselor_signed_at`, `soldier_signed`, `soldier_signed_at`

### Schema Changes — `development_goals` (simplify)

Keep: `id`, `personnel_id`, `organization_id`, `title`, `created_at`, `updated_at`
Add: `term_type` (text: 'short' | 'long')
Change: `status` becomes boolean `is_completed` (default false)
Repurpose: `progress_notes` or `description` becomes single `notes` (text, nullable)
Drop: `category`, `priority`, `target_date`, and whichever of `description`/`progress_notes` is not repurposed as `notes`

### Schema Changes — Drop

- Drop `counseling_types` table entirely
- Clean migration since production data is test/demo only
- Recreate demo/sandbox sample data for the new model

### Data Loading

- List page: no additional data beyond what layout provides (personnel list)
- Soldier record page `+page.server.ts` fetches: extended info, counseling records, goals, personnel trainings (for that Soldier only), current + next upcoming availability/status
- Integrates with the existing selective data loading system to avoid loading training data on the list page route

### Counseling Entry UX

- Subject field uses placeholder text to guide format: e.g., "Event-Oriented: Late to PT"
- Notes field is nullable and hidden by default behind an "Add Note" button to keep the form clean
- PDF upload uses existing `FileUpload` component and `counseling-files` Supabase storage bucket
- Entries displayed in reverse chronological order

### API Routes

- Simplified counseling records CRUD (new model)
- Simplified development goals CRUD (new model)
- Extended info API updated for new fields
- Single-Soldier status fetch (current + next upcoming)
- All routes enforce permission checks, group scoping, rate limiting, audit logging, and input validation per existing security rules

### Personnel List UX

- Simple cards: rank, name, group
- No stats bar (would require loading extra data)
- Search box + group filter + count
- Alphabetical sort by last name
- Constrained card width to avoid sparse appearance with small lists

## Testing Decisions

Good tests verify external behavior (API contracts, rendered output, navigation) rather than implementation details (internal state, private methods, store internals).

### Server-side tests (unit/integration)

- **`+page.server.ts` data loading**: Verify correct data is fetched for a single Soldier, permission scoping works (view vs edit), group scoping filters correctly, archived personnel are excluded.
- **Counseling records API**: CRUD operations return correct shapes, permission enforcement (view-only users cannot create/edit/delete), group scoping enforcement, deletion approval flow for non-privileged users, input validation (date format, required fields).
- **Development goals API**: CRUD operations, permission enforcement, term_type validation, is_completed toggle.
- **Extended info API**: CRUD with new fields, children JSON validation, military_education JSON validation.

### E2E tests

- **Core flow**: Navigate to Leaders Book list, search/filter for a Soldier, click to open record, verify tabs render, switch between tabs via clicks, verify URL query param updates.
- **Counseling flow**: Add a counseling entry with date + subject, add optional notes, upload PDF, verify entry appears in list, delete entry.
- **Permission flow**: View-only user sees only Data Sheet + Training tabs, edit user sees all four tabs.
- **Prior art**: Existing E2E tests in `e2e/specs/leaders-book.spec.ts` (will need to be rewritten for new structure), patterns from `e2e/specs/personnel.spec.ts` and `e2e/specs/training.spec.ts`.

## Out of Scope

- **Rating scheme**: Stays in Personnel area, not part of this redesign.
- **Counseling authoring/workflow**: No built-in DA 4856 form builder or digital signature flow — leaders create counselings offline and upload the signed PDF.
- **Counseling type management**: Removed entirely — no type categorization system.
- **Status history**: Only current + next upcoming status shown, no historical view.
- **Per-tab lazy loading**: All Soldier data loaded in one fetch; per-tab fetching is unnecessary given the small data volume per Soldier.
- **Print/export of Soldier record**: May be added later but not part of V1.
- **Bulk operations**: No bulk counseling entry or bulk goal creation — this is a one-Soldier-at-a-time tool.
- **Moving rating scheme into Leaders Book**: May happen in the future but is a separate decision.

## Further Notes

- The Leaders Book redesign aligns with the ongoing work to make data loading selective per route. The list page should declare that it does NOT need training data loaded in the layout.
- The `counseling-files` Supabase storage bucket and its RLS policies remain unchanged — the FileUpload component works as-is.
- Demo/sandbox data should be recreated to showcase the new simplified model with realistic-looking Soldier Data Sheet entries, a few counseling PDFs, and sample goals.
- The existing `src/features/counseling/` directory is being cleaned out by the user. The new feature module will be `src/features/leaders-book/` with its own components, stores, types, and utils following the established feature module pattern.
- All new API routes must use the `apiRoute` wrapper with proper permission, audit, and validation configuration per existing conventions.
