# Personnel Detail Page PRD

## Problem Statement

The Personnel detail page at `/org/[orgId]/personnel/[personnelId]` exists as a prototype with hardcoded mock data for readiness lanes, placeholder follow-ups (plain strings), fallback counseling records, and mock extended info.

Leaders need one place to manage a Soldier — not two competing surfaces. The Leaders Book as a separate feature is retired (ADR 0008). Its surviving content moves into the Personnel detail page, which becomes the single per-Soldier leader dashboard.

## Solution

Rebuild the Personnel detail page as a real leader dashboard for a single Soldier. The page becomes a summary surface with quick actions, linking out to dedicated sub-pages for deeper work. It absorbs the valuable parts of the Leaders Book (counseling records, Soldier Data Sheet fields) while dropping the parts that didn't match how leaders work (development goals, counseling workflows) and adding new capabilities (follow-ups, general document storage).

### Design Principles

- **Dashboard, not data dump.** The detail page shows what a leader needs to act on now. Deeper views live on sub-pages.
- **One per-Soldier surface.** No separate Leaders Book route. Everything about a Soldier lives under Personnel.
- **Simple filing, not workflows.** Counseling records and documents are storage with metadata. No signature tracking, status workflows, recurrence, or form building.
- **Follow-ups replace development goals.** One flexible working list covers action items, counseling reminders, award recommendations, and developmental goals.

## Related Decisions

- [ADR 0008](../architecture/adrs/0008-leaders-book-retirement-and-personnel-absorption.md) — Leaders Book retirement and Personnel absorption
- [ADR 0003](../architecture/adrs/0003-leaders-book-and-rating-scheme-boundary.md) — Leaders Book / Rating Scheme boundary (resolved by ADR 0008)

## User Stories

### Dashboard and Navigation

1. As a leader, I want a single Personnel detail page that shows me everything I need to know and do for one Soldier, so I don't have to switch between multiple feature areas.
2. As a leader, I want human-readable URLs for Soldier pages (e.g., `/personnel/rivera-monica`) instead of UUIDs, so URLs are recognizable and shareable.
3. As a leader, I want each content area (follow-ups, counselings, documents, notes) to have a summary on the dashboard with a "show all" link to a dedicated sub-page, so the dashboard stays focused.
4. As a leader, I want the Soldier header (name, rank, group, MOS, duty role) to persist across the dashboard and all sub-pages, so I always know whose record I'm viewing.

### Follow-Ups

5. As a leader, I want to create follow-ups for a Soldier with a title, optional notes, and optional due date, so I can track everything I need to do for or about this Soldier.
6. As a leader, I want to complete and reopen follow-ups without reloading the page, so I can work through my list quickly.
7. As a leader, I want to edit and archive follow-ups, so I can keep my working list current.
8. As a leader, I want the dashboard to show open follow-ups with inline create and complete actions, so I can work directly from the summary.
9. As a leader, I want a dedicated follow-ups sub-page showing the full history including completed and archived items, so I can review past work.
10. As a leader, I want to use follow-ups for counseling reminders ("Counsel SGT Smith for late formation"), award recommendations ("Recommend AAM for FTX performance"), and developmental goals ("Complete BLC packet by August"), so I don't need separate systems for each.

### Counseling Records

11. As a leader, I want to upload a signed counseling PDF with a date conducted, title, and optional summary sentence, so I have a digital record of the counseling session.
12. As a leader, I want the dashboard to show the most recent counseling uploads, so I can see the counseling history at a glance.
13. As a leader, I want a dedicated counselings sub-page with the full chronological list, so I can review the complete counseling packet.

### Documents

14. As a leader, I want to upload general documents (certificates, BLS cards, inspection worksheets, scanned forms) to a Soldier's record, so I have a digital filing cabinet for anything that doesn't fit counseling records.
15. As a leader, I want the document title pre-populated from the filename but editable before I submit, so I can name files clearly without extra typing when the filename is already good.
16. As a leader, I want the dashboard to show recent document uploads, so I can see what's in the filing cabinet at a glance.
17. As a leader, I want a dedicated documents sub-page with the full list, so I can browse and manage all uploaded files.

### Soldier Data Sheet

18. As a leader, I want to view essential service details (rank, name, MOS, duty role, group, ETS, PCS/DEROS) and key extended info (emergency contact, phone, address) in the dashboard sidebar, so I have quick reference without navigating away.
19. As a leader, I want a "More info" button that opens the full Soldier Data Sheet in a modal, so I can view all reference data without leaving the dashboard.
20. As a leader, I want the Soldier Data Sheet modal to be large on desktop with a smart multi-column layout grouping related fields, and to use tabs on tablet/mobile, so the data is well-organized regardless of screen size.
21. As a leader, I want to record a Soldier's blood type, BASD, date of rank, marital status, number of dependents, children's names and ages, civilian education level, and military education entries (BLC, ALC, Airborne, etc.), so I have the same reference data as a traditional paper Soldier Data Sheet.

### Leader Notes

22. As a leader, I want to add observation and accomplishment notes to a Soldier's record ("Stepped up during FTX and reworked setup/teardown," "Trained 15 dustoff medics on advanced airways"), so I have material for NCOER bullets and award justifications.
23. As a leader, I want the dashboard sidebar to show the most recent leader note, so I have context at a glance.
24. As a leader, I want a dedicated notes sub-page with the full journal in chronological order, so I can review the complete observation history.

### Readiness Lanes

25. As a leader, I want the readiness summary cards (Availability, Training, Critical Tasks, Duty Roster, Rating Scheme, Loss Tracking) to show real data from their respective features, so I can see a Soldier's readiness posture at a glance.

### Quick Actions

26. As a leader, I want to perform quick actions directly from the dashboard — completing a follow-up, uploading a counseling PDF or document, adding a leader note, and editing basic personnel info (rank change, name change) — so I can handle routine admin without navigating to sub-pages.

### Access Control

27. As a view-only user, I should not be able to access the Personnel detail page at all, since everything I need is available on the roster list page.

## Implementation Decisions

### Route Structure

The Personnel detail page uses a Personnel Slug (derived from `lastName-firstName`, unique per Organization) instead of UUIDs in the URL. The internal personnel id remains the stable database identity.

```
/org/[orgId]/personnel/[personnelSlug]            — dashboard
/org/[orgId]/personnel/[personnelSlug]/follow-ups  — full follow-up history
/org/[orgId]/personnel/[personnelSlug]/counselings — full counseling list
/org/[orgId]/personnel/[personnelSlug]/documents   — full document list
/org/[orgId]/personnel/[personnelSlug]/notes       — full leader notes journal
```

The `[personnelSlug]` layout provides a persistent Soldier header across all sub-pages. Each sub-page has its own `+page.server.ts` and loads only its own data.

### Personnel Slug

- Derived from `lastName-firstName` (lowercased, kebab-cased)
- Scoped to the Organization (two Organizations may have the same slug)
- Collisions resolved with numeric suffix: `smith-john`, `smith-john-2`
- Auto-regenerates when the Soldier's name changes
- Collision suffix re-evaluated only for the person whose name changed (existing slugs for other people are not renumbered)
- No stale slug redirects — old URLs simply 404
- Internal personnel id remains the stable database identity

### Dashboard Layout

The detail page is a summary dashboard, not a data dump. Each content area shows a limited preview with a link to its dedicated sub-page.

**Main content area (left on desktop):**
1. Readiness lanes — 6 summary cards (Availability, Training, Critical Tasks, Duty Roster, Rating Scheme, Loss Tracking)
2. Follow-ups panel — open items with inline create/complete actions, "Show all" link
3. Counseling records panel — last 3-5 uploads with "Upload PDF" action, "Show all" link
4. Documents panel — recent uploads with "Upload" action, "Show all" link

**Sidebar (right on desktop):**
1. Service details — rank, name, MOS, duty role, group, group roster count, ETS, PCS/DEROS
2. Extended info summary — emergency contact, personal phone, address. "More info" button opens full Soldier Data Sheet modal
3. Leader notes — most recent note with "Add note" action, "Show all" link

### Soldier Data Sheet Modal

- Desktop: large modal (near full-width) with multi-column layout grouping related fields (personal info, military dates, family/dependents, education, emergency contact)
- Tablet/mobile: same modal with fields organized under tabs to avoid long single-column scrolling
- Editable fields within the modal for quick updates

### Access Control

The entire Personnel detail page (dashboard and all sub-pages) is gated behind `operate` capability on the Personnel lane. No partial visibility — a user either has full access or uses the roster list page. This applies to all content: follow-ups, counseling records, documents, leader notes, and the Soldier Data Sheet.

Group-scoped users cannot access detail pages for Soldiers outside their scope.

### Follow-Ups

Follow-ups are a first-class persisted entity, not derived placeholders. They are a free-form leader working list that replaces both the old derived follow-ups and the development goals concept from the Leaders Book PRD.

**Data model:**
- `organization_id`, `personnel_id` — scoping
- `creator_id` / `owner` — who created it
- `title` — required
- `notes` — optional freeform text
- `due_date` — optional
- `status` — open, completed, archived
- `created_at`, `updated_at`, `completed_at` — timestamps

**Behavior:**
- Create, complete/reopen, edit, and archive/remove
- Streamed independently from the rest of the Personnel detail data
- Fixed-height skeletons during loading to avoid layout shift
- Scoped to the Soldier and Organization
- Group-scoped users cannot access follow-ups for Soldiers outside their scope
- Current derived follow-ups kept as suggestions or placeholders only until real follow-up rows exist

### Counseling Records

Counseling records are lightweight PDF storage, not a workflow tool.

**Data model:**
- `organization_id`, `personnel_id` — scoping
- `date_conducted` — when the counseling session happened
- `title` — required (e.g., "Q2 performance counseling", "Event-Oriented: Late to PT")
- `summary` — optional, one or two sentences
- `uploaded_by` — who uploaded the record
- `file_path` — reference to the stored PDF
- `created_at`, `updated_at` — timestamps

**What counseling records are not:**
- No signature tracking (counselor signed, soldier signed)
- No status workflows (draft, pending, completed)
- No recurrence or follow-up date scheduling
- No counseling type management or categorization system
- No built-in DA 4856 form builder

### Documents

General-purpose file storage for anything that isn't a counseling record.

**Data model:**
- `organization_id`, `personnel_id` — scoping
- `title` — derived from filename (extension stripped, hyphens/underscores converted to spaces), editable by the user before submit
- `file_path` — reference to the stored file
- `uploaded_by` — who uploaded it
- `created_at` — timestamp

**Constraints:**
- Accepted file types: PDF, JPEG, PNG, HEIC
- Maximum file size: 10MB per file
- Per-Soldier storage cap: 100MB default, configurable at the Organization level
- No video files (MP4, MOV), no archive files (ZIP, RAR)
- The per-Soldier cap is stored as an organization-level setting (not hardcoded) to leave the door open for future add-on tiers that increase the cap

### Soldier Data Sheet Field Expansion

Expand `personnel_extended_info` with the following fields to match the traditional Army Soldier Data Sheet:

**New columns:**
- `blood_type` (text, nullable)
- `basd` (date, nullable) — Basic Active Service Date
- `date_of_rank` (date, nullable)
- `marital_status` (text, nullable)
- `number_of_dependents` (integer, nullable)
- `children` (jsonb, nullable) — array of `{name: string, age: number}`
- `civilian_education` (text, nullable)
- `military_education` (jsonb, nullable) — array of strings, e.g., `["BLC", "ALC", "Airborne"]`

**Existing fields retained:**
- Emergency contact (name, relationship, phone)
- Spouse (name, phone)
- Vehicle (make/model, plate, color)
- Personal contact (email, phone, address)

### Leader Notes

Leader notes are an observation and accomplishment journal — distinct from follow-ups.

**Data model:**
- `organization_id`, `personnel_id` — scoping
- `author` — who wrote the note
- `text` — the observation or accomplishment
- `created_at` — timestamp

**Use cases:**
- NCOER bullet material ("Stepped up during FTX and reworked setup/teardown process")
- Award justification evidence ("Trained 15 dustoff medics on advanced airways")
- General leader observations ("Strong performer, good candidate for extra duty leadership")

### Readiness Lanes

Wire the 6 readiness summary cards to real data from their respective features:

- **Availability**: today's Calendar status for the Soldier
- **Training**: count of due/overdue training records
- **Critical Tasks**: current ICT completion percentage
- **Duty Roster**: last duty date and exemption status
- **Rating Scheme**: whether rater/senior rater are assigned (cross-lane read)
- **Loss Tracking**: ETS proximity

Each lane is a cross-feature data read. These should be streamed independently so the dashboard renders progressively.

### Leaders Book Removal

The Leaders Book is fully retired per ADR 0008. The following must be removed:

- `/org/[orgId]/leaders-book` route and redirect
- `leaders-book` permission flag from memberships and invitations
- Leaders Book settings toggle
- Leaders Book help copy and dashboard links
- Leaders Book feature module code (`src/features/leaders-book/` if present)
- `counseling_types` table (if still present)
- Development goals table and related code
- Any `leaders-book` references in exports, plans UI, or onboarding

## Implementation Slices

These are independently deliverable vertical slices, listed in suggested priority order:

### Slice 1: Follow-Ups (Issue #875)
Already scoped. Adds persistence, CRUD, streaming, UI panel, and tests for leader-created follow-ups on the Personnel detail page.

### Slice 2: Personnel Slug
- Add `slug` column to the personnel table (or a lookup table)
- Implement slug generation from `lastName-firstName` with collision handling
- Backfill existing Personnel Records with slugs
- Update route from `[personnelId]` to `[personnelSlug]` with slug-to-id resolution in `+page.server.ts`
- Update all internal links to Personnel detail pages

### Slice 3: Sub-Page Routes and Layout
- Create shared `[personnelSlug]` layout with persistent Soldier header
- Create sub-page routes: `/follow-ups`, `/counselings`, `/documents`, `/notes`
- Add "Show all" navigation from dashboard panels to sub-pages
- Each sub-page gets its own `+page.server.ts`

### Slice 4: Soldier Data Sheet Expansion
- Add new columns to `personnel_extended_info`
- Build the Soldier Data Sheet modal (multi-column desktop, tabbed mobile)
- Add "More info" button to the sidebar extended info section
- Update extended info API for new fields

### Slice 5: Documents Upload System
- Create `documents` table and storage bucket
- Implement file type validation (PDF, JPEG, PNG, HEIC) and size limits (10MB/file)
- Implement per-Soldier storage cap (100MB default, org-configurable)
- Build upload UI with filename-derived title, editable before submit
- Build dashboard panel (recent documents) and `/documents` sub-page
- Enforce Personnel permission model

### Slice 6: Readiness Lanes
- Wire each of the 6 readiness cards to real data from their respective features
- Stream each lane independently for progressive rendering
- Replace mock data with real queries

### Slice 7: Leaders Book Removal
- Remove `/leaders-book` route and redirect
- Remove `leaders-book` permission flag, settings toggle, help copy, dashboard links
- Remove Leaders Book feature module code
- Drop `counseling_types` table and development goals table if still present
- Clean up any remaining `leaders-book` references across the codebase

## Out Of Scope

- **Counseling authoring/workflow**: No built-in DA 4856 form builder, digital signature flow, status workflows, or recurrence. Leaders create counselings offline and upload the signed PDF.
- **Counseling type management**: No type categorization system.
- **Development goals as a separate concept**: Replaced by follow-ups.
- **Video or archive file uploads**: Documents accept PDF, JPEG, PNG, HEIC only.
- **Print/export of Soldier record**: May be added later.
- **Bulk operations**: No bulk follow-up creation, bulk document upload, or bulk counseling entry.
- **Rating Scheme integration beyond readiness lane**: Rating Scheme remains independently grantable and is not absorbed into Personnel.
- **Storage add-on billing**: The per-Soldier cap is configurable at the org level to leave the door open, but no add-on purchase flow is built.
- **Stale slug redirects**: When a name changes, the old URL simply 404s. No redirect history.

## Testing Decisions

### Server-side tests

- **Follow-ups**: CRUD operations, permission/scoping enforcement, streaming behavior
- **Documents**: Upload validation (file type, size, per-Soldier cap), CRUD, permission enforcement
- **Counseling records**: CRUD, permission enforcement
- **Leader notes**: CRUD, permission enforcement
- **Personnel slug**: Generation, collision handling, auto-regeneration on name change
- **Access control**: `operate` capability gate on detail page and all sub-pages, group scope enforcement

### E2E tests

- Navigate from roster list to Personnel detail page via slug URL
- Create, complete, reopen, and archive a follow-up
- Upload a counseling PDF with date, title, and summary
- Upload a document, verify filename-derived title, edit title before submit
- Open Soldier Data Sheet modal, verify field layout
- Navigate between dashboard and sub-pages, verify Soldier header persists
- Verify view-only user cannot access the detail page
