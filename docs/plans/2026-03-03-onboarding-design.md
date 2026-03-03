# Onboarding Feature Design

## Overview

Personnel onboarding tracker: a standalone page where leaders define an org-level onboarding checklist template, start onboardings for new personnel, and track per-step progress through training, paperwork workflows, and simple tasks.

## Requirements

- Standalone top-level page at `/org/[orgId]/onboarding`
- Single org-level onboarding template (checklist of steps)
- Three step types: **training** (auto-detects from training records), **multi-stage paperwork** (custom stages per step), **checkbox** (simple toggle)
- Per-step timestamped notes
- Person-focused list view with inline expand for detail
- Snapshot approach: template changes only affect future onboardings

## Database Schema

### `onboarding_template_steps`

Org-level onboarding checklist definition.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `org_id` | uuid FK → organizations | |
| `name` | text | e.g., "SAAR Form", "BLS Training" |
| `description` | text nullable | Optional instructions |
| `step_type` | text | `'training'`, `'paperwork'`, `'checkbox'` |
| `training_type_id` | uuid nullable FK → training_types | Only for `step_type = 'training'` |
| `stages` | jsonb nullable | Only for `step_type = 'paperwork'`. Array of stage names. |
| `sort_order` | int | Display order |
| `created_at` | timestamptz | Default now() |

### `personnel_onboardings`

Enrolls a person in the onboarding process.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `org_id` | uuid FK → organizations | |
| `personnel_id` | uuid FK → personnel | Unique per org+person |
| `started_at` | date | When onboarding began |
| `completed_at` | date nullable | Set when all steps done |
| `status` | text | `'in_progress'`, `'completed'`, `'cancelled'` |
| `created_at` | timestamptz | Default now() |

### `onboarding_step_progress`

Per-person progress on each step. Data is snapshotted from the template at enrollment time.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `onboarding_id` | uuid FK → personnel_onboardings | |
| `step_name` | text | Snapshotted from template |
| `step_type` | text | `'training'`, `'paperwork'`, `'checkbox'` |
| `training_type_id` | uuid nullable FK → training_types | For training steps |
| `stages` | jsonb nullable | For paperwork — snapshotted stage names |
| `sort_order` | int | Snapshotted display order |
| `completed` | boolean | Default false |
| `current_stage` | text nullable | For paperwork — current stage name |
| `notes` | jsonb | Default `[]`. Array of `{text: string, timestamp: string}` |
| `updated_at` | timestamptz | Default now() |

**Key design decisions:**
- Step progress rows snapshot template data (name, type, stages, sort_order) so in-progress onboardings are unaffected by template edits.
- Training-linked steps derive completion from `personnel_trainings` (auto-detect). The `completed` column is not used for training steps — completion is resolved at read time by checking if a valid training record exists.
- Paperwork steps track progression through custom stages. When `current_stage` equals the last stage in the `stages` array, the step is complete.

## UI Structure

### Navigation
New top-level nav item "Onboarding" alongside Personnel, Training, Calendar, etc.

### Onboarding List Page
- Header: "Onboarding" title + "Manage Template" button + "Start Onboarding" button
- List of people being onboarded, each showing: rank + name, start date, progress bar (X/Y steps), status badge
- Filter toggle for active vs. completed onboardings
- Click a person row to inline-expand their step detail

### Inline Detail (expanded row)
- Progress summary at top
- Step list, each showing:
  - **Checkbox**: Toggle to complete/incomplete
  - **Training**: Auto-resolved status from training records (green/red indicator). Read-only.
  - **Paperwork**: Current stage indicator (mini progress). Click to advance/retreat stages.
- Each step has a collapsible notes section with timestamped entries and "Add Note" input
- Notes display newest-first

### Template Manager (settings modal)
- Accessed via "Manage Template" button
- List of template steps with reorder capability
- Add/edit/remove steps
- Step creation form varies by type:
  - Training: name + training type picker dropdown
  - Paperwork: name + stage list editor (add/remove/reorder stages)
  - Checkbox: name + optional description

## Interactions

### Starting an Onboarding
1. "Start Onboarding" → modal with personnel picker (people not currently being onboarded)
2. Select person, set start date (default today)
3. Creates `personnel_onboardings` row + one `onboarding_step_progress` row per template step (snapshotted)

### Updating Step Progress
- **Checkbox**: Toggle click → PUT to update `completed`
- **Paperwork**: Advance/retreat stage → PUT to update `current_stage` (auto-sets `completed` when last stage reached)
- **Training**: No user action — derived from `personnel_trainings` at render time

### Adding Notes
- Click notes icon on a step → expand notes area
- Text input + "Add" → appends `{text, timestamp: now}` to the `notes` JSONB array via PUT

### Completing an Onboarding
- When all steps show complete (checkbox toggled, paperwork at final stage, training records exist), the onboarding auto-marks as completed with `completed_at = today`
- "Cancel Onboarding" button sets status to `cancelled`

## Permissions

Reuses existing permission model:
- View onboarding list: `can_view_personnel`
- Modify onboarding (start, update, notes): `can_edit_personnel`
- Manage template: `can_edit_personnel`

## API Endpoints

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/org/[orgId]/api/onboarding-template` | GET, POST, PUT, DELETE | CRUD template steps |
| `/org/[orgId]/api/onboarding` | GET, POST, PUT, DELETE | CRUD personnel onboardings |
| `/org/[orgId]/api/onboarding-progress` | PUT | Update step progress |

## Stores

Two Svelte 5 rune-based stores:
- `onboardingTemplateStore` — template step definitions
- `onboardingStore` — personnel onboardings with nested step progress data

Both follow existing patterns: `$state()` for data, `.load()` for hydration, optimistic updates with rollback.

## Data Loading

Server-side in `+page.server.ts`:
- Load template steps, active onboardings with step progress, personnel list, training types, and personnel trainings (for auto-detection)
- Hydrate stores via `$effect()` in the page component
