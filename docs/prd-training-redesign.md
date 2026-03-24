# PRD: Training System Redesign

## Problem Statement

The current training system has UX and scalability issues that make it increasingly painful as organizations grow:

1. **Training Type Management** is jammed into a modal that tries to handle creation, editing, reordering, and viewing in a cramped 600px space.
2. **The matrix doesn't scale** — organizations with 35+ training types and 200+ personnel face a wall of colored pills with no way to focus on subsets. The horizontal scrollbar is hidden below the fold, so users don't know they can scroll.
3. **Cell design** (colored pills with text labels) creates visual noise at scale and doesn't match the site's clean aesthetic.
4. **Reports** are constrained to a modal, the "By Personnel" export creates duplicate rows per person per deficient training, and there's no readiness dashboard for leadership.
5. **Training applicability rules** are limited to role-based only — real-world rules involve MOS, rank, and exclusions.
6. **No loading feedback** — slow government machines get a blank screen while data loads.

## Prerequisites

- Route standardization via ports-and-adapters (issue #358) must be complete before implementation. All new routes will use `handle()`/`loadWithContext()` patterns.

## Hard Constraints

- **Backward compatibility**: Existing training type configurations must migrate without breaking. No user action required.
- All existing rules from CLAUDE.md apply: permission checks, group scoping, read-only mode, archived personnel exclusion, audit logging, rate limiting, input validation.

---

## Design Decisions

### Page Architecture: Hub-and-Spoke

The training section becomes a multi-page area with clear navigation hierarchy:

| Route | Purpose | Pattern |
|-------|---------|---------|
| `/training` | Matrix (hub) | Primary workspace |
| `/training/types` | Type management (spoke) | Breadcrumb + back button |
| `/training/reports` | Reports & dashboard (spoke) | Breadcrumb + back button |

Navigation from hub to spokes via toolbar buttons (already exist as "Manage Types" and "Reports"). Spokes have breadcrumb trail: `Training > Types` / `Training > Reports` and a back link.

**Kept as modals** (transactional, not workspaces):
- Sign-in rosters
- Bulk import
- Individual record editing (cell click)
- Person training editor (person name click)

### Matrix Redesign

#### Heatmap Cell Design

Replace colored pills with **cell-background tinting**:

- Each cell's background is tinted with the status color (subtle, not fully saturated)
- Cell content: the relevant date (completion or expiration date)
- Non-date states show short text: "Exempt", "N/R", "N/A"
- Click-to-edit behavior unchanged

This is the industry standard for compliance/training matrices. It scales better (narrower cells, no pill padding), reduces visual noise, and matches mental models from spreadsheet-based trackers.

A **legend strip** at the top or bottom of the matrix maps colors to status meanings.

#### Viewport-Constrained Container

The matrix container must be constrained to the viewport height so both horizontal and vertical scrollbars are always visible:

```
height: calc(100dvh - [header + stats bar + filter bar])
overflow: auto (both axes)
```

Sticky first column (personnel names) and sticky header row are retained.

#### Default Sort: By Group

The matrix defaults to "By Group" sorting on load (pinned groups first, then alphabetical, matching personnel page behavior). The A-Z / By Group toggle remains for users who prefer alphabetical.

#### View-Aware Stats Bar

The existing stats bar (Current, Expiring 60d, Expiring 30d, Expired, Not Done) is retained but becomes **view-aware**: stats reflect only the training types visible in the currently selected view.

### Views System

#### What is a View

A named, saved configuration defining:
- Which training type columns are visible
- The display order of those columns within the view

A view does NOT include personnel filters or sort — those remain independent controls.

#### Ownership and Permissions

- Views are **per-org**, created and managed by admins/owners
- All org members can see and use saved views
- "All Trainings" is always available as the default unfiltered state (not a saved view)

#### UI Location

Views are managed **inline on the matrix page**, not on a separate page:

- A dropdown in the filter bar: `[All Trainings v]`
- Selecting a view filters the visible columns and updates stats
- An "Edit" icon next to the dropdown (admin/owner only) opens an inline panel or small modal for view management (name, check/uncheck training types, reorder columns)

#### Persistence

Last-used view is remembered per-device via `localStorage`. On first visit or cleared storage, defaults to "All Trainings."

#### Column Ordering

Two layers:
1. **Global default order** — set on the types page via sort order
2. **Per-view order** — each saved view can override column order for its subset

"All Trainings" always uses the global default order.

### Training Types Page (`/training/types`)

#### Layout

Two-panel layout matching the onboarding/templates pattern:

- **Left panel**: List of training types with color swatch, name, and summary line (e.g., "12mo | All roles" or "Never expires | 68W only")
- **Right panel**: Detail view for the selected type

#### Interaction: View-Then-Edit

The right panel shows a **read-only display** of the selected type's configuration. An "Edit" button enters edit mode. This is deliberate — training type changes affect org-wide compliance and warrant an intentional action.

#### Progressive Disclosure in Editor

The edit form is organized into logical sections with sensible defaults so simple cases are simple:

**Section 1 — Basics** (always visible)
- Name
- Description
- Color picker

**Section 2 — Expiration**
Three mutually exclusive radio options (replaces the current confusing checkbox combo):
- "Expires after X months" (default, with number input)
- "Never expires"
- "Expiration date varies per person" (expiration-date-only mode)

**Section 3 — Warning Thresholds**
- Only visible when expiration is relevant (hidden for "never expires")
- Yellow threshold (days, default 60)
- Orange threshold (days, default 30)
- Colored dot indicators retained

**Section 4 — Applicability** (expanded from current system)
See "Applicability Rules" section below.

**Section 5 — Options**
- "Can be exempted" toggle (individual exemptions managed from the matrix, not here)

#### Creating a New Type

The simple case (e.g., "BLS, expires every 24 months") requires only Section 1 and choosing the first radio in Section 2. Sections 3-5 have sensible defaults. An average user never needs to scroll past Section 2.

### Expanded Applicability Rules

#### Current State

`requiredForRoles: string[]` — select from org roles or "All". Individual overrides via `exemptPersonnelIds`.

#### New Model

Two rule groups with OR logic across multiple dimensions:

**Applies To** (empty = everyone):
- Roles: multi-select chips
- MOS: multi-select chips
- Ranks: multi-select chips

**Excluded** (optional, collapsed by default):
- Roles: multi-select chips
- MOS: multi-select chips
- Ranks: multi-select chips

Logic: If "Applies To" is empty, the training applies to everyone minus exclusions. If populated, it applies to anyone matching ANY selected value in any dimension, minus exclusions.

**Individual exemptions** (`exemptPersonnelIds`) remain and are managed from the matrix cell/record modal only. They are the escape hatch for one-off cases.

#### Migration Path

| Current Data | New Data | Behavior |
|---|---|---|
| `requiredForRoles: ['*']` | `appliesTo: { roles: [], mos: [], ranks: [] }` | Everyone. Identical. |
| `requiredForRoles: ['Officer', 'NCO']` | `appliesTo: { roles: ['Officer', 'NCO'], mos: [], ranks: [] }` | Same roles. Identical. |
| `requiredForRoles: []` | `appliesTo: { roles: [], mos: [], ranks: [] }` | Optional for all. Identical. |
| `exemptPersonnelIds` | `exemptPersonnelIds` | Unchanged. |

No existing training type definitions break. New MOS/rank dimensions start empty (no filtering effect). Purely additive migration.

### Reports Page (`/training/reports`)

#### Top Section: Readiness Dashboard

Summary-level view for commanders/leadership:
- **Overall readiness percentage**: current / total applicable
- **Status breakdown**: count cards for each status (expanded versions of the matrix stats bar)
- **Worst training types**: top 5 training types by non-compliance rate
- **Group comparison**: which groups are most/least compliant

#### Bottom Section: Filterable Detail Table

Action-list view for training NCOs/coordinators:
- Filterable by: group, MOS, role, rank, training type, status
- One row per person, one column per training type (pivot-style, matching matrix layout)
- Only shows training types matching current filter
- Sortable columns

#### Filters Control Both Sections

Filtering to "2nd Platoon, BLS only" updates both the dashboard stats and the detail table to reflect that slice.

#### Export

The export produces a CSV matching the filtered detail table:
- Pivot-style: one row per person, one column per training type
- Each cell contains status + relevant date
- Only includes the currently filtered training types and personnel
- Replaces the current one-row-per-training-per-person format

### Skeleton Loading

#### Reusable Primitives

New shared UI components in `$lib/components/ui/`:

- `SkeletonLine` — a single pulsing line placeholder (configurable width, height)
- `SkeletonBlock` — a rectangular pulsing block (configurable dimensions)
- `SkeletonGrid` — a grid of pulsing cells (configurable rows, columns)

These are generic primitives that can be composed into page-specific skeleton layouts across the app, not just training.

#### Training-Specific Skeletons

The matrix page renders its full structure immediately (toolbar, filter bar, stats bar, matrix container) with skeleton placeholders:
- Stats bar: `SkeletonBlock` for each stat card
- Matrix: `SkeletonGrid` matching the heatmap cell dimensions
- Filter bar: rendered immediately (no skeleton needed)

Data replaces skeletons as it loads. On slow government machines, this turns a blank white screen into an instant page structure with progressive data population.

---

## Database Changes

### Modified: `training_types` table

New columns (all nullable, backward-compatible):
- `applies_to_mos text[]` — MOS codes this training applies to (empty = no MOS filter)
- `applies_to_ranks text[]` — ranks this training applies to (empty = no rank filter)
- `excluded_roles text[]` — roles excluded from this training
- `excluded_mos text[]` — MOS codes excluded
- `excluded_ranks text[]` — ranks excluded

Existing `required_for_roles` column is renamed or aliased to `applies_to_roles` for consistency. Migration sets `applies_to_roles = required_for_roles` for all existing rows.

### New: `training_views` table

```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
name            text NOT NULL
column_ids      uuid[] NOT NULL          -- ordered list of training_type IDs
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

RLS: org members can read, admins/owners can insert/update/delete.

---

## New Routes

| Route | Type | Purpose |
|-------|------|---------|
| `/org/[orgId]/training/types/+page.svelte` | Page | Training type management |
| `/org/[orgId]/training/types/+page.server.ts` | Server | Load types + available roles/MOS/ranks |
| `/org/[orgId]/training/reports/+page.svelte` | Page | Reports dashboard + detail table |
| `/org/[orgId]/training/reports/+page.server.ts` | Server | Load report data |
| `/org/[orgId]/training/+layout.svelte` | Layout | Shared training section layout (breadcrumbs) |

Existing training API routes are updated to support the new applicability fields and views CRUD.

---

## New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `SkeletonLine` | `$lib/components/ui/` | Single line placeholder |
| `SkeletonBlock` | `$lib/components/ui/` | Rectangular block placeholder |
| `SkeletonGrid` | `$lib/components/ui/` | Grid of cell placeholders |
| `TrainingTypesPage` | `$features/training/components/` | Two-panel type management |
| `TrainingTypeDetail` | `$features/training/components/` | Right panel: view + edit mode |
| `TrainingReportsPage` | `$features/training/components/` | Dashboard + detail table |
| `ReadinessDashboard` | `$features/training/components/` | Top section of reports |
| `ViewSelector` | `$features/training/components/` | Dropdown + inline view editor |
| `MatrixLegend` | `$features/training/components/` | Color-to-status legend strip |
| `ApplicabilityEditor` | `$features/training/components/` | Multi-dimension applies-to/excluded editor |

---

## Future Considerations (Not In Scope)

- **Drag-and-drop reordering**: A shared `SortableList` component (using `svelte-dnd-action`) for both training type ordering and onboarding template step ordering. The types page and view editor should be structured to support drop-in replacement of arrow buttons with drag handles.
- **Condensed matrix mode**: Auto-switch to compact cells (hide dates, color-only) when column count exceeds a threshold. Only build if real users request it.
- **View-based lazy loading**: Fetch training records only for the active view's training types first, backfill the rest in the background.
- **Stale-while-revalidate caching**: Cache training data client-side, show cached data immediately on repeat visits, refresh in background.

---

## Implementation Order (Suggested)

1. **Skeleton loading primitives** — reusable across the app, immediate UX win
2. **Heatmap cell redesign + viewport fix** — biggest visual/UX improvement to the existing page
3. **Default by-group sort** — small change, big usability win
4. **Types page** — move type management out of modal, add expanded applicability rules
5. **Views system** — depends on types page for column ordering
6. **Reports page** — depends on views for filtered export alignment
7. **Migration**: applicability rules DB changes can ship with step 4, views table with step 5
