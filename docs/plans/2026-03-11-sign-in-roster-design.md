# Sign-In Roster Feature Design

## Overview

Modal-based sign-in roster generator accessible from the training page. Allows users to generate printable PDF rosters for in-person training events, optionally save records, and upload signed scans for record-keeping.

## Data Model

New `sign_in_rosters` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| org_id | uuid FK → organizations | |
| title | text NOT NULL | User-entered title |
| roster_date | date | The date shown on the roster |
| blank_date | boolean NOT NULL default false | If true, date line left blank on PDF |
| separate_by_group | boolean NOT NULL default false | |
| sort_by | text NOT NULL default 'alphabetical' | 'alphabetical' or 'rank' |
| personnel_snapshot | jsonb NOT NULL | Array of { id, rank, name, group } frozen at generation time |
| filter_config | jsonb | Groups/ranks selected for re-generation |
| signed_file_path | text | Supabase storage path for uploaded signed scan (nullable) |
| created_by | uuid FK → auth.users | |
| created_at | timestamptz NOT NULL default now() | |

RLS: org members can read/write their own org's rosters. Delete restricted to canEditTraining.

## UI Flow

### Entry Point

Button labeled "Sign-In Rosters" on the training page toolbar, next to the existing "Reports" button.

### Modal: Primary View (Roster List)

- Opens showing 20 most recent saved rosters, newest first
- Each row: title, date, personnel count, upload indicator icon (paperclip/checkmark if signed copy uploaded)
- Filter bar: text search on title + date range picker
- Pagination via "Load more" or prev/next
- "New Roster" button at top
- Clicking a row opens detail view with actions:
  - Download original PDF (re-generated from snapshot)
  - Upload/replace signed scan
  - Download signed scan
  - Re-print
  - Delete

### Modal: Create View (New Roster)

- **Title**: text input (required)
- **Date**: radio toggle — "Print specific date" (date picker, defaults today) or "Leave blank for handwriting"
- **Separate by group**: toggle switch
- **Sort by**: radio — "Alphabetical" or "By Rank"
- **Who to include**:
  - Category quick-toggles: "All Officers" / "All Warrant" / "All Enlisted" / "Civilians"
    - Toggling a category selects/deselects all rank chips in that category
    - If any rank within a category is manually deselected, the category toggle un-highlights
    - Category toggle reflects actual state (highlighted only when ALL ranks in category are selected)
  - Individual rank chips (same pattern as DutyRosterGenerator)
  - Group chips for filtering by group
- **Footer**: "Cancel" and "Generate" buttons
- Generate → opens browser print dialog via window.open() + window.print()
- After generation: prompt "Save this roster?" (Yes/No)
  - Yes → saves to DB, returns to list view
  - No → returns to list view, nothing saved

## PDF Layout

Generated via existing print-to-new-window pattern.

- **Header**: Title in large bold text (18-20pt), centered. Date below (formatted date or blank underline), centered.
- **Body**: Table with columns: Rank | Name | Signature (empty cell with bottom border, ~3 inches wide)
- **Group separation**: Group name as bold sub-header row spanning full width before each group's personnel
- **Rows**: ~25-30 per page
- **Print CSS**: Portrait orientation, reasonable margins. Page-break-before on group headers if fewer than 3 rows would remain on current page (prevent orphaned headers).

## API Endpoints

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | /org/[orgId]/api/sign-in-rosters | List saved rosters (paginated, filterable) | canViewTraining |
| POST | /org/[orgId]/api/sign-in-rosters | Save new roster record | canViewTraining |
| DELETE | /org/[orgId]/api/sign-in-rosters/[id] | Delete roster + uploaded file | canEditTraining |
| POST | /org/[orgId]/api/sign-in-rosters/[id]/upload | Upload signed scan | canEditTraining |
| DELETE | /org/[orgId]/api/sign-in-rosters/[id]/upload | Remove signed scan | canEditTraining |

No dedicated "download original PDF" endpoint — component re-generates from personnel_snapshot and stored config.

## Permissions

- **Generate/save rosters**: canViewTraining (anyone who can see training can generate)
- **Delete rosters**: canEditTraining
- **Upload signed scans**: canEditTraining
- **Group scoping**: Scoped members only see personnel in their group when generating

## Storage

- Signed scan uploads use existing `counseling-files` Supabase storage bucket
- Storage path: `{orgId}/sign-in-rosters/{rosterId}/{filename}`

## Sorting

- **Alphabetical**: last name, then first name
- **By Rank**: uses existing RANK_ORDER (GEN → CIV), alphabetical as secondary sort
- Civilians sort last per existing RANK_ORDER

## Technical Patterns

- Modal component follows DutyRosterGenerator pattern (view switching within modal)
- PDF generation uses existing window.open() + window.print() pattern
- Rank sorting reuses RANK_ORDER/RANK_INDEX from personnelGrouping.ts
- Group organization reuses groupAndSortPersonnel utility
- File upload reuses FileUpload component pattern with counseling-files bucket
- No new libraries required
