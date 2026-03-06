# OER/NCOER Rating Scheme Design

## Goal

Maintain rating chain relationships (rater, senior rater, optional intermediate rater/reviewer) for personnel and track evaluation timelines with auto-calculated due-date warnings, per AR 623-3.

## Architecture

Flat data model with visual grouping. Each rated individual gets a `rating_scheme_entries` record linking them to their rating officials and tracking the rating period. The UI lives under the Personnel page as a new "Rating Scheme" view, with two sub-views: a grouped hierarchy view (read-friendly) and a flat table view (edit-friendly).

## Data Model

### Table: `rating_scheme_entries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid FK NOT NULL | Org scope for RLS |
| `rated_person_id` | uuid FK NOT NULL | References `personnel.id` |
| `eval_type` | text NOT NULL | `'OER'`, `'NCOER'`, or `'WOER'` |
| `rater_person_id` | uuid FK nullable | Internal rater |
| `rater_name` | text nullable | External rater freetext (rank + name + position) |
| `senior_rater_person_id` | uuid FK nullable | Internal senior rater |
| `senior_rater_name` | text nullable | External senior rater freetext |
| `intermediate_rater_person_id` | uuid FK nullable | Optional internal intermediate rater |
| `intermediate_rater_name` | text nullable | Optional external intermediate rater |
| `reviewer_person_id` | uuid FK nullable | Optional internal reviewer |
| `reviewer_name` | text nullable | Optional external reviewer |
| `rating_period_start` | date NOT NULL | Start of rating period |
| `rating_period_end` | date NOT NULL | Thru date (when eval is due) |
| `status` | text NOT NULL DEFAULT 'active' | `'active'`, `'completed'`, `'change-of-rater'` |
| `notes` | text nullable | Freeform |
| `created_at` | timestamptz | Default now() |
| `updated_at` | timestamptz | Trigger-maintained |

For each rater role, exactly one of `*_person_id` or `*_name` should be populated. Rater and senior rater are required (at least one of each pair). Intermediate rater and reviewer are optional.

One rated person may have multiple entries (e.g., an active entry and completed historical entries).

## UI Design

### Location

Personnel page gains a view toggle at the top: **Roster** (existing) | **Rating Scheme** (new).

### Stats Bar

Same pattern as training page. Counts across active entries:
- **Overdue** (red) — past thru date, not completed
- **Due in 30d** (orange)
- **Due in 60d** (yellow)
- **Current** (green) — more than 60 days out
- **Completed** (gray)

### Grouped View (default)

Entries grouped by senior rater, then sub-grouped by rater. Each entry shows: rated person (rank + name), eval type badge, rating period, due-date status badge. External raters shown with freetext name in parenthetical style.

### Table View

Flat sortable table with columns: Type, Rated, Rank, Rater, Senior Rater, Thru Date, Status. Rows clickable to open edit modal. Useful for initial bulk setup.

### Filter

Dropdown: Active (default), Completed, Change of Rater, All.

### Add/Edit Modal

- **Rated person**: dropdown of all org personnel, auto-suggests eval type from rank category (officer -> OER, NCO -> NCOER, warrant -> WOER) but editable
- **Eval type**: OER / NCOER / WOER radio or select
- **Rater**: toggle between internal (personnel dropdown) and external (freetext field)
- **Senior Rater**: same toggle pattern
- **Intermediate Rater** (optional, collapsed by default): same toggle pattern
- **Reviewer** (optional, collapsed by default): same toggle pattern
- **Rating period**: start date + end date (thru date)
- **Status**: Active / Completed / Change of Rater
- **Notes**: optional textarea
- Footer: `[Delete] [spacer] [Cancel] [Save]`

### Due-Date Warning Thresholds

Reuses training status color pattern:
- Green: > 60 days to thru date
- Yellow: 31-60 days
- Orange: 1-30 days
- Red: past thru date and status is active
- Gray: completed

### Personnel Scope

Only personnel explicitly added appear in the rating scheme. No auto-population. The rated person dropdown shows all org personnel but does not filter by rank — this allows unusual cases (e.g., SPC in NCO role).
