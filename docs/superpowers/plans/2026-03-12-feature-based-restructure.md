# Feature-Based Codebase Restructure

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the codebase from flat type-based directories (all components together, all stores together) to feature-based modules where each feature is self-contained with clear boundaries.

**Architecture:** Each feature domain (training, personnel, calendar, etc.) becomes a module under `src/features/` containing its own components, stores, types, and utils. Shared infrastructure remains in `src/lib/`. SvelteKit routes stay in `src/routes/` but become thin shells that import from feature modules. API routes stay in `src/routes/` (SvelteKit requirement) but use shared server infrastructure from `src/lib/server/`.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), TypeScript

---

## Execution Pattern (Same for All Phases)

Each phase follows the same sequence:
1. **Types** — Extract feature types to `feature.types.ts`, update all imports
2. **Utils** — Move feature utils, fix internal + external imports
3. **Stores** — Move feature stores, fix internal + external imports
4. **Components** — Move feature components, fix internal (relative → `$lib/`) + external imports
5. **Barrel export** — Create `index.ts` re-exporting types, stores, utils
6. **Verify** — `npm run build`, grep for stale imports, manual smoke test
7. **Commit**

For each moved file:
- **Internal imports**: Relative paths (`../types`, `./Modal.svelte`) become absolute (`$lib/types`, `$lib/components/Modal.svelte`) or feature-relative
- **External consumers**: Absolute paths (`$lib/stores/foo.svelte`) become `$features/featureName/stores/foo.svelte`

---

## Phase 1: Setup + Training Feature (COMPLETED)

Phase 1 has been executed. The `$features` alias is configured and the training feature module is complete at `src/features/training/`.

---

## Phase 2: Personnel Feature

**STOP POINT after this phase.**

### What Moves

**Types to extract from `src/lib/types.ts`:**
- `Personnel` interface (lines 1-11)

> **Decision: Keep `Personnel` in `src/lib/types.ts`.** The `Personnel` type is imported by 30+ files across every feature. Moving it would touch nearly the entire codebase for no architectural benefit — it's truly shared infrastructure. Same rationale as `ARMY_RANKS`, `ALL_RANKS`, and permission types. They stay in `src/lib/types.ts`.

**Components (4):**

| File | Relative imports to fix | External consumers |
|------|------------------------|-------------------|
| `PersonnelModal.svelte` | `../types` → `$lib/types`; `../stores/groups.svelte` → `$lib/stores/groups.svelte`; `./Modal.svelte` → `$lib/components/Modal.svelte`; `./ui/ConfirmDialog.svelte` → `$lib/components/ui/ConfirmDialog.svelte` | `personnel/+page.svelte` |
| `PersonnelRow.svelte` | `../types` → `$lib/types`; `../stores/dailyAssignments.svelte` → `$lib/stores/dailyAssignments.svelte`; `../utils/dates` → `$lib/utils/dates`; `./DateCell.svelte` → `$lib/components/DateCell.svelte` | `Calendar.svelte` (internal to calendar feature — update when calendar moves) |
| `BulkPersonnelManager.svelte` | `../stores/groups.svelte` → `$lib/stores/groups.svelte`; `../types` → `$lib/types`; `../utils/csvParser` → `$lib/utils/csvParser`; `../utils/columnMapping` → `$lib/utils/columnMapping`; `./ui/BulkImportTable.svelte` → `$lib/components/ui/BulkImportTable.svelte`; `./ui/ConfirmDialog.svelte` → `$lib/components/ui/ConfirmDialog.svelte`; `./Modal.svelte` → `$lib/components/Modal.svelte` | `personnel/+page.svelte` |
| `ExtendedInfoModal.svelte` | `./Modal.svelte` → `$lib/components/Modal.svelte` | `SoldierLeadersBookView.svelte` |

**Stores (2):**

| File | Internal imports to fix | External consumers |
|------|----------------------|-------------------|
| `personnel.svelte.ts` | `../types` → `$lib/types`; `../utils/deletionRequests` → `$lib/utils/deletionRequests` | `calendar/+page.svelte`, `personnel/+page.svelte`, `onboarding/+page.svelte`, `+page.svelte` (dashboard) |
| `personnelExtendedInfo.svelte.ts` | `../types/leadersBook` → `$lib/types/leadersBook` | `ExtendedInfoModal.svelte`, `SoldierLeadersBookView.svelte`, `leaders-book/+page.svelte` |

**Utils (1):**

| File | Internal imports to fix | External consumers |
|------|----------------------|-------------------|
| `personnelGrouping.ts` | `../types` → `$lib/types` | `training/+page.svelte`, `personnel/+page.svelte`, `calendar/+page.svelte`, `SignInRosterModal.svelte` |

### Tasks

- [ ] **Task 2.1:** Create directory structure: `src/features/personnel/{components,stores,utils}`
- [ ] **Task 2.2:** Move `personnelGrouping.ts` → `src/features/personnel/utils/`, fix internal import (`../types` → `$lib/types`), update 4 external consumers to `$features/personnel/utils/personnelGrouping`
- [ ] **Task 2.3:** Move both stores, fix internal imports, update all external consumers
- [ ] **Task 2.4:** Move all 4 components, fix relative imports → `$lib/` absolute paths, update external consumers
- [ ] **Task 2.5:** Create barrel export `src/features/personnel/index.ts`
- [ ] **Task 2.6:** Verify — `npm run build`, grep for stale `lib/stores/personnel\.svelte`, `lib/stores/personnelExtendedInfo`, `lib/components/PersonnelModal`, `lib/components/PersonnelRow`, `lib/components/BulkPersonnelManager`, `lib/components/ExtendedInfoModal`, `lib/utils/personnelGrouping`
- [ ] **Task 2.7:** Commit

### Smoke Test
- Personnel page: add/edit/delete personnel
- Bulk import
- Calendar still renders PersonnelRow
- Leaders Book shows ExtendedInfoModal
- Dashboard personnel stats

---

### **=== STOP POINT 2 ===**

---

## Phase 3: Calendar Feature

**STOP POINT after this phase. This is the largest phase — 15 components.**

### What Moves

**Types to extract from `src/lib/types.ts`:**
- `StatusType` interface
- `AvailabilityEntry` interface
- `SpecialDay` interface
- `DEFAULT_STATUS_TYPES` const

**Components (15):**

| File | Key relative imports to fix | External consumers |
|------|----------------------------|-------------------|
| `Calendar.svelte` | `../types`, `../stores/dailyAssignments.svelte`, `./CalendarHeader.svelte` (now sibling), `./PersonnelRow.svelte` → `$features/personnel/...`, `./GroupHeader.svelte` → `$lib/components/GroupHeader.svelte` | `calendar/+page.svelte` |
| `CalendarHeader.svelte` | `../types`, `../stores/dailyAssignments.svelte`, `../utils/dates` | `Calendar.svelte` (sibling) |
| `DateCell.svelte` | `../types`, `../stores/dailyAssignments.svelte` | `PersonnelRow.svelte` (in personnel feature) |
| `AvailabilityModal.svelte` | `../types`, `../utils/dates`, `./Modal.svelte`, `./ui/Badge.svelte`, `./ui/ConfirmDialog.svelte` | `calendar/+page.svelte` |
| `StatusTypeManager.svelte` | `../types`, `./ui/Badge.svelte`, `./ui/EmptyState.svelte`, `./ui/ConfirmDialog.svelte` | `calendar/+page.svelte` |
| `SpecialDayManager.svelte` | `../types`, `../utils/dates`, `./ui/ConfirmDialog.svelte` | `calendar/+page.svelte` |
| `BulkStatusModal.svelte` | `../types`, `../utils/dates`, `./Modal.svelte` | `calendar/+page.svelte` |
| `BulkStatusRemoveModal.svelte` | `../types`, `../utils/dates`, `./Modal.svelte`, `./ui/Spinner.svelte` | `calendar/+page.svelte` |
| `TodayBreakdown.svelte` | `../types`, `../stores/dailyAssignments.svelte`, `../utils/dates` | `calendar/+page.svelte` |
| `StatusLegend.svelte` | `../types` | `calendar/+page.svelte` |
| `PersonStatusModal.svelte` | `$lib/types`, `$lib/stores/statusTypes.svelte`, `$lib/stores/availability.svelte`, `./Modal.svelte`, `./ui/Badge.svelte`, `./ui/Spinner.svelte`, `./ui/ConfirmDialog.svelte` | `SoldierLeadersBookView.svelte` (counseling feature) |
| `DailyAssignmentModal.svelte` | `../types`, `../stores/dailyAssignments.svelte`, `../utils/dates`, `./Modal.svelte` | `calendar/+page.svelte` |
| `AssignmentTypeManager.svelte` | `../stores/dailyAssignments.svelte`, `./ui/Badge.svelte`, `./ui/EmptyState.svelte`, `./ui/ConfirmDialog.svelte` | `calendar/+page.svelte` |
| `MonthlyAssignmentPlanner.svelte` | `../types`, `../stores/dailyAssignments.svelte`, `../utils/dates`, `./ui/ConfirmDialog.svelte` | `calendar/+page.svelte` |
| `LongRangeView.svelte` | `../types`, `../stores/dailyAssignments.svelte`, `../utils/dates`, `../utils/calendarExport` | `calendar/+page.svelte` |

**Stores (6):**

| File | Internal imports to fix | External consumers |
|------|----------------------|-------------------|
| `availability.svelte.ts` | `../types`, `../utils/dates` | `calendar/+page.svelte`, `SoldierLeadersBookView.svelte`, `PersonStatusModal.svelte`, `onboarding/+page.svelte`, `leaders-book/+page.svelte` |
| `calendar.svelte.ts` | `../utils/dates` | `calendar/+page.svelte` |
| `specialDays.svelte.ts` | `../types`, `../utils/dates` | `calendar/+page.svelte` |
| `statusTypes.svelte.ts` | `../types` | `calendar/+page.svelte`, `SoldierLeadersBookView.svelte`, `PersonStatusModal.svelte`, `onboarding/+page.svelte`, `+page.svelte` (dashboard), `leaders-book/+page.svelte` |
| `dailyAssignments.svelte.ts` | (exports interfaces only, no lib imports) | `calendar/+page.svelte`, `Calendar.svelte`, `CalendarHeader.svelte`, `DateCell.svelte`, `TodayBreakdown.svelte`, `DailyAssignmentModal.svelte`, `MonthlyAssignmentPlanner.svelte`, `LongRangeView.svelte`, `DutyRosterGenerator.svelte`, `+page.svelte` (dashboard), `calendarExport.ts`, `assignment-types/+server.ts` |
| `calendarPrefs.svelte.ts` | `$app/environment` (no lib imports) | `calendar/+page.svelte` |

**Utils (2):**

| File | Internal imports to fix | External consumers |
|------|----------------------|-------------------|
| `federalHolidays.ts` | `../types` → calendar types, `./dates` → `$lib/utils/dates` | `special-days/+server.ts`, `org/new/+page.server.ts` |
| `calendarExport.ts` | `../types`, `../stores/dailyAssignments.svelte`, `./dates` → `$lib/utils/dates` | `calendar/+page.svelte`, `LongRangeView.svelte` (sibling) |

### Cross-Feature Dependencies

- `PersonnelRow.svelte` (personnel feature) imports `DateCell.svelte` — after this phase, update to `$features/calendar/components/DateCell.svelte`
- `SoldierLeadersBookView.svelte` (counseling) imports `PersonStatusModal` — after this phase, update to `$features/calendar/components/PersonStatusModal.svelte`
- `DutyRosterGenerator.svelte` imports `dailyAssignments.svelte` types — update import
- `transforms.ts` imports `StatusType`, `AvailabilityEntry`, `SpecialDay` — update to calendar types

### Tasks

- [ ] **Task 3.1:** Create directory: `src/features/calendar/{components,stores,utils}`
- [ ] **Task 3.2:** Create `src/features/calendar/calendar.types.ts` — extract `StatusType`, `AvailabilityEntry`, `SpecialDay`, `DEFAULT_STATUS_TYPES` from `src/lib/types.ts`. Update all consumers (~15 files including other features and `transforms.ts`).
- [ ] **Task 3.3:** Move `federalHolidays.ts` and `calendarExport.ts` utils, fix imports
- [ ] **Task 3.4:** Move all 6 stores, fix internal imports, update all external consumers
- [ ] **Task 3.5:** Move all 15 components, fix relative → absolute imports, update external consumers. **Key:** `PersonnelRow.svelte` in personnel feature must update `DateCell` import to `$features/calendar/...`. `SoldierLeadersBookView.svelte` must update `PersonStatusModal` import.
- [ ] **Task 3.6:** Create barrel export `src/features/calendar/index.ts`
- [ ] **Task 3.7:** Verify — build + grep for stale paths + smoke test
- [ ] **Task 3.8:** Commit

### Smoke Test
- Calendar page: month view, availability modals, status types, special days, assignments
- Bulk status add/remove
- Long range view
- Monthly assignment planner
- Personnel row date cells still render
- Leaders book PersonStatusModal still works
- Dashboard availability stats

---

### **=== STOP POINT 3 ===**

---

## Phase 4: Counseling / Leaders Book Feature

**STOP POINT after this phase.**

### What Moves

**Types:**
- Move entire `src/lib/types/leadersBook.ts` → `src/features/counseling/counseling.types.ts`
- Extract from `src/lib/types.ts`:
  - `ReportType`, `ReportTypeOption`, `OER_REPORT_TYPES`, `NCOER_REPORT_TYPES`, `WOER_REPORT_TYPES`
  - `WorkflowStatus`, `WorkflowStatusOption`, `WORKFLOW_STATUS_OPTIONS`, `WORKFLOW_STATUS_COLORS`
  - `RatingSchemeEntry`
  - `RatingDueStatus`, `RATING_STATUS_COLORS`

**Components (7):**

| File | Key imports to fix | External consumers |
|------|-------------------|-------------------|
| `SoldierLeadersBookView.svelte` | Already uses `$lib/` and `$features/training/` absolute paths. Fix: `./CounselingRecordModal` → sibling, `./DevelopmentGoalModal` → sibling, `./ExtendedInfoModal` → `$features/personnel/...`, `./PersonStatusModal` → `$features/calendar/...` | `leaders-book/+page.svelte` |
| `CounselingRecordModal.svelte` | `$lib/types/leadersBook` → `../counseling.types`, `./Modal.svelte` → `$lib/components/Modal.svelte`, `./ui/Spinner.svelte`, `./ui/FileUpload.svelte`, `./ui/ConfirmDialog.svelte` → `$lib/components/ui/...` | `SoldierLeadersBookView.svelte` (sibling) |
| `CounselingTypeManager.svelte` | `$lib/types/leadersBook` → `../counseling.types`, `./ui/Badge.svelte`, `./ui/EmptyState.svelte`, `./ui/FileUpload.svelte`, `./ui/ConfirmDialog.svelte` → `$lib/components/ui/...` | `leaders-book/+page.svelte` |
| `DevelopmentGoalModal.svelte` | `$lib/types/leadersBook` → `../counseling.types`, `./Modal.svelte` → `$lib/components/Modal.svelte`, `./ui/ConfirmDialog.svelte` → `$lib/components/ui/...` | `SoldierLeadersBookView.svelte` (sibling) |
| `RatingSchemeEntryModal.svelte` | `$lib/types` (rating types → counseling types), `./Modal.svelte`, `./ui/Spinner.svelte`, `./ui/SearchSelect.svelte` → `$lib/components/...` | `personnel/+page.svelte` |
| `RatingSchemeTableView.svelte` | `$lib/types` (rating types → counseling types), `./ui/Badge.svelte`, `./ui/EmptyState.svelte` → `$lib/components/ui/...` | `personnel/+page.svelte` |
| `RatingSchemeGroupedView.svelte` | `$lib/types` (rating types → counseling types), `./ui/Badge.svelte`, `./ui/EmptyState.svelte` → `$lib/components/ui/...` | `personnel/+page.svelte` |

**Stores (5):**

| File | Internal imports to fix | External consumers |
|------|----------------------|-------------------|
| `counselingRecords.svelte.ts` | `../types/leadersBook`, `../utils/deletionRequests` | `CounselingRecordModal.svelte` (sibling), `SoldierLeadersBookView.svelte` (sibling), `leaders-book/+page.svelte` |
| `counselingTypes.svelte.ts` | `../types/leadersBook`, `../utils/deletionRequests` | `CounselingRecordModal.svelte` (sibling), `SoldierLeadersBookView.svelte` (sibling), `leaders-book/+page.svelte` |
| `developmentGoals.svelte.ts` | `../types/leadersBook`, `../utils/deletionRequests` | `DevelopmentGoalModal.svelte` (sibling), `SoldierLeadersBookView.svelte` (sibling), `leaders-book/+page.svelte` |
| `ratingScheme.svelte.ts` | `../types` (rating types), `../utils/deletionRequests` | `personnel/+page.svelte` |
| `personnelExtendedInfo.svelte.ts` | `../types/leadersBook` | `ExtendedInfoModal.svelte` (personnel feature), `SoldierLeadersBookView.svelte` (sibling), `leaders-book/+page.svelte` |

**Utils (2):**

| File | Internal imports to fix | External consumers |
|------|----------------------|-------------------|
| `ratingScheme.ts` | `../types` (needs `ARMY_RANKS` from `$lib/types` + rating types from counseling types) | `RatingSchemeEntryModal.svelte` (sibling), `RatingSchemeTableView.svelte` (sibling), `RatingSchemeGroupedView.svelte` (sibling), `personnel/+page.svelte`, `+page.svelte` (dashboard), `ratingSchemeExport.ts` (sibling) |
| `ratingSchemeExport.ts` | `$lib/types` (Personnel), `./ratingScheme` (sibling), `xlsx` (external) | `personnel/+page.svelte` |

### Cross-Feature Dependencies

- `personnel/+page.svelte` imports RatingScheme components, store, utils, and types — all update to `$features/counseling/...`
- `+page.svelte` (dashboard) imports `RATING_STATUS_COLORS` and `getRatingDueStatus` — update to `$features/counseling/...`
- `ExtendedInfoModal` (personnel feature) imports `personnelExtendedInfoStore` — update to `$features/counseling/stores/...`
- `leaders-book/+page.server.ts` imports from `$lib/types/leadersBook` — update to `$features/counseling/counseling.types`

### Tasks

- [ ] **Task 4.1:** Create directory: `src/features/counseling/{components,stores,utils}`
- [ ] **Task 4.2:** Move `src/lib/types/leadersBook.ts` → `src/features/counseling/counseling.types.ts`. Extract rating scheme types from `src/lib/types.ts` and append to same file. Update all consumers.
- [ ] **Task 4.3:** Move `ratingScheme.ts` and `ratingSchemeExport.ts` utils, fix imports
- [ ] **Task 4.4:** Move all 5 stores, fix internal imports, update external consumers
- [ ] **Task 4.5:** Move all 7 components, fix relative → absolute, update external consumers (especially `personnel/+page.svelte` which imports 3 RatingScheme components)
- [ ] **Task 4.6:** Create barrel export `src/features/counseling/index.ts`
- [ ] **Task 4.7:** Verify — build + grep + smoke test
- [ ] **Task 4.8:** Commit

### Smoke Test
- Leaders Book page: soldier view, counseling records, development goals, extended info
- Personnel page: rating scheme table/grouped views, add/edit rating scheme entries
- Dashboard: rating scheme stats

---

### **=== STOP POINT 4 ===**

---

## Phase 5: Onboarding Feature

**STOP POINT after this phase.**

### What Moves

**Types to extract from `src/lib/types.ts`:**
- `OnboardingStepType` type
- `OnboardingStatus` type
- `OnboardingTemplateStep` interface
- `OnboardingStepNote` interface
- `OnboardingStepProgress` interface
- `PersonnelOnboarding` interface

**Components (3):**

| File | Key imports to fix | External consumers |
|------|-------------------|-------------------|
| `OnboardingTemplateManager.svelte` | `$lib/types` (OnboardingTemplateStep → onboarding types), `$features/training/training.types` (already correct), `./Modal.svelte` → `$lib/components/Modal.svelte`, `./ui/Badge.svelte`, `./ui/EmptyState.svelte`, `./ui/ConfirmDialog.svelte` → `$lib/components/ui/...` | `onboarding/+page.svelte` |
| `OnboardingReportModal.svelte` | `$lib/types` (onboarding types → onboarding feature types), `$features/training/training.types` (already correct), `./Modal.svelte`, `./ui/Badge.svelte` → `$lib/components/...` | `onboarding/+page.svelte` |
| `StartOnboardingModal.svelte` | `../types` → `$lib/types` (Personnel), onboarding types → feature types; `../stores/groups.svelte` → `$lib/stores/groups.svelte`; `./Modal.svelte` → `$lib/components/Modal.svelte`; `./PersonnelModal.svelte` → `$features/personnel/components/PersonnelModal.svelte`; `./ui/Spinner.svelte` → `$lib/components/ui/Spinner.svelte` | `onboarding/+page.svelte` |

**Stores (2):**

| File | Internal imports to fix | External consumers |
|------|----------------------|-------------------|
| `onboarding.svelte.ts` | `../types` (onboarding types → feature types) | `onboarding/+page.svelte` |
| `onboardingTemplate.svelte.ts` | `../types` (OnboardingTemplateStep → feature types) | `onboarding/+page.svelte` |

### Cross-Feature Dependencies

- `onboarding/+page.svelte` imports training stores and TrainingRecordModal from `$features/training/` — already correct from Phase 1
- `StartOnboardingModal` imports `PersonnelModal` — update to `$features/personnel/components/PersonnelModal.svelte`
- `OnboardingReportModal` imports `TrainingType`, `PersonnelTraining` — already from `$features/training/`

### Tasks

- [ ] **Task 5.1:** Create directory: `src/features/onboarding/{components,stores}`
- [ ] **Task 5.2:** Create `src/features/onboarding/onboarding.types.ts` — extract 6 onboarding types from `src/lib/types.ts`. Update all consumers.
- [ ] **Task 5.3:** Move both stores, fix internal imports, update external consumers
- [ ] **Task 5.4:** Move all 3 components, fix relative → absolute, update `onboarding/+page.svelte`
- [ ] **Task 5.5:** Create barrel export `src/features/onboarding/index.ts`
- [ ] **Task 5.6:** Verify — build + grep + smoke test
- [ ] **Task 5.7:** Commit

### Smoke Test
- Onboarding page: start onboarding, template manager, progress tracking
- Onboarding report modal
- Training steps within onboarding

---

### **=== STOP POINT 5 ===**

---

## Phase 6: Remaining Features

**STOP POINT after this phase.**

### 6A: Duty Roster

**Components (1):**

| File | Key imports to fix | External consumers |
|------|-------------------|-------------------|
| `DutyRosterGenerator.svelte` | `../types` → `$lib/types` + calendar types; `../stores/dailyAssignments.svelte` → `$features/calendar/stores/...`; `../stores/dutyRosterHistory.svelte` → sibling store; `../utils/dates` → `$lib/utils/dates`; `./ui/ConfirmDialog.svelte` → `$lib/components/ui/...`; `./Modal.svelte` → `$lib/components/Modal.svelte` | `calendar/+page.svelte` |

**Stores (1):**

| File | Internal imports | External consumers |
|------|-----------------|-------------------|
| `dutyRosterHistory.svelte.ts` | (exports interfaces, no lib imports) | `calendar/+page.svelte`, `transforms.ts`, `export/+server.ts` |

**Tasks:**
- [ ] **Task 6A.1:** Create `src/features/duty-roster/{components,stores}`, move files, fix imports, create barrel export
- [ ] **Task 6A.2:** Verify build

### 6B: Sign-in Rosters

**Components (1):**

| File | Key imports to fix | External consumers |
|------|-------------------|-------------------|
| `SignInRosterModal.svelte` | `$lib/types` (Personnel + SignInRoster), `$lib/utils/personnelGrouping` → `$features/personnel/utils/...`, `./Modal.svelte` → `$lib/components/Modal.svelte`, `./ui/Spinner.svelte`, `./ui/EmptyState.svelte` → `$lib/components/ui/...` | `training/+page.svelte` |

**Types:** Extract `SignInRoster` interface from `src/lib/types.ts`

**Tasks:**
- [ ] **Task 6B.1:** Create `src/features/sign-in-rosters/components/`, create `sign-in-rosters.types.ts`, move component, fix imports, create barrel export
- [ ] **Task 6B.2:** Verify build

### 6C: Groups / Members

**Components (3):**

| File | Key imports to fix | External consumers |
|------|-------------------|-------------------|
| `GroupManager.svelte` | `../stores/groups.svelte` → `$lib/stores/groups.svelte`; `./ui/ConfirmDialog.svelte` → `$lib/components/ui/...` | `personnel/+page.svelte` |
| `OrganizationMemberManager.svelte` | `$lib/types` (permissions — stays), `$lib/utils/dates`, `./ui/Badge.svelte`, `./ui/ConfirmDialog.svelte` → `$lib/components/ui/...` | `settings/+page.svelte` |
| `PlatformInviteManager.svelte` | `$lib/utils/dates`, `./ui/ConfirmDialog.svelte` → `$lib/components/ui/...` | `admin/users/+page.svelte` |

**Stores:** `groups.svelte.ts` and `pinnedGroups.svelte.ts` stay in `src/lib/stores/` (shared across 5+ features)

**Tasks:**
- [ ] **Task 6C.1:** Create `src/features/groups/components/`, move 3 components, fix imports, create barrel export
- [ ] **Task 6C.2:** Verify build

### Final Phase 6 Steps

- [ ] **Task 6.final:** Run full build, grep for any stale `lib/components/DutyRoster`, `lib/components/SignInRoster`, `lib/components/GroupManager`, `lib/components/OrganizationMember`, `lib/components/PlatformInvite`, `lib/stores/dutyRosterHistory`
- [ ] **Commit all Phase 6**

### Smoke Test
- Calendar page: duty roster generator
- Training page: sign-in roster modal
- Personnel page: group manager
- Settings page: organization member manager
- Admin: platform invite manager

---

### **=== STOP POINT 6 ===**

---

## Phase 7: Final Cleanup

**STOP POINT after this phase. This completes the restructure.**

### Task 7.1: Verify `src/lib/types.ts` Only Contains Shared Types

After all extractions, this file should contain only:
- `Personnel` interface (shared across all features)
- `OrganizationMemberPermissions` interface
- `OrganizationMember` interface
- `OrganizationInvitation` interface
- `PermissionPreset` type + `PERMISSION_PRESETS` const
- `getPermissionPreset()` function
- `isFullEditor()` function
- `ARMY_RANKS` const + `ALL_RANKS` const

Everything else should have been extracted to feature modules. Verify and clean up.

### Task 7.2: Verify `src/lib/stores/` Only Contains Shared Stores

Should contain only:
- `groups.svelte.ts` — used by 5+ features
- `pinnedGroups.svelte.ts` — used by calendar + dashboard
- `subscription.svelte.ts` — used by all features for billing gating
- `demoMode.svelte.ts` — shared demo state
- `theme.svelte.ts` — shared UI preference
- `toast.svelte.ts` — shared notification
- `whatsNew.svelte.ts` — shared changelog
- `help.svelte.ts` — shared help state
- `dashboardPrefs.svelte.ts` — shared dashboard preferences

### Task 7.3: Verify `src/lib/utils/` Only Contains Shared Utils

Should contain only:
- `dates.ts` — used by 10+ features
- `csvParser.ts` — used by training + personnel bulk import
- `columnMapping.ts` — used by training + personnel bulk import
- `deletionRequests.ts` — used by 4+ features

### Task 7.4: Verify `src/lib/components/` Only Contains Shared Components

Should contain only:
- `ui/` subdirectory (all shared primitives: Badge, Spinner, EmptyState, etc.)
- `Modal.svelte` — base modal wrapper
- `PageToolbar.svelte` — shared toolbar
- `TopHeader.svelte` — shared header
- `BottomTabBar.svelte` — shared nav
- `GroupHeader.svelte` — shared group display
- `DemoBanner.svelte` — shared demo banner
- `DemoSandboxModal.svelte` — shared demo modal
- `SubscriptionBanner.svelte` — shared billing banner
- `WhatsNewModal.svelte` — shared changelog modal
- `FeedbackModal.svelte` — shared feedback modal
- `DashboardCustomizeModal.svelte` — shared dashboard modal

### Task 7.5: Delete Empty `src/lib/types/` Directory

After `leadersBook.ts` moves to counseling feature, check if `src/lib/types/` is empty (only `subscription.ts` may remain — that stays). Clean up if empty.

### Task 7.6: Update CLAUDE.md

Update the "File Organization" section to reflect the new feature-based structure:

```
src/
  features/
    training/          — training types, matrix, reports, bulk import
    personnel/         — personnel CRUD, bulk import, extended info
    calendar/          — calendar views, availability, status, assignments
    counseling/        — counseling records, rating scheme, leaders book
    onboarding/        — onboarding workflows, templates
    duty-roster/       — duty roster generation
    sign-in-rosters/   — sign-in roster generation
    groups/            — group/member management
  lib/
    components/ui/     — shared primitives (Badge, Spinner, EmptyState, etc.)
    components/        — shared layout components (Modal, PageToolbar, etc.)
    server/            — shared server infra (permissions, validation, etc.)
    stores/            — shared cross-cutting stores (groups, subscription, etc.)
    types.ts           — shared types (Personnel, permissions, ranks)
    utils/             — shared utils (dates, csvParser, deletionRequests)
  routes/              — SvelteKit routes (thin shells importing from features)
```

### Task 7.7: Final Full Verification

```bash
npm run build
```

Manual smoke test ALL features:
1. Dashboard — stats, training alerts, rating scheme alerts
2. Calendar — month view, availability, status types, assignments, long range, duty roster
3. Personnel — list, add/edit, bulk import, rating scheme, groups
4. Training — matrix, type manager, reports, bulk import, sign-in rosters
5. Leaders Book — soldier view, counseling, development goals, extended info
6. Onboarding — templates, start onboarding, progress, reports
7. Admin Hub — approvals, archived, audit, settings

---

### **=== STOP POINT 7 (COMPLETE) ===**

---

## Summary of Phases

| Phase | Feature | Files Moved | Blast Radius | Stop Point |
|-------|---------|-------------|-------------|------------|
| 1 | Training (DONE) | 7 components, 2 stores, 1 util, types | ~15 files | Yes |
| 2 | Personnel | 4 components, 2 stores, 1 util | ~10 files | Yes |
| 3 | Calendar | 15 components, 6 stores, 2 utils, types | ~25 files (largest) | Yes |
| 4 | Counseling/Leaders Book | 7 components, 5 stores, 2 utils, types | ~15 files | Yes |
| 5 | Onboarding | 3 components, 2 stores, types | ~5 files | Yes |
| 6 | Remaining (duty roster, sign-in, groups) | 5 components, 1 store, types | ~8 files | Yes |
| 7 | Final cleanup + CLAUDE.md | Cleanup only | CLAUDE.md | Yes (done) |

**Total: ~41 components, ~18 stores, ~8 utils migrated across 7 phases.**
