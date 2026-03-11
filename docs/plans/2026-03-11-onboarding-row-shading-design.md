# Onboarding Row Shading Design

## Problem
Personnel being onboarded can be in a 1:1 status for up to 90 days. On the calendar, their empty cells look identical to fully available personnel. This makes it hard to differentiate at a glance.

## Solution
Apply a subtle brass background tint to empty calendar cells for personnel with active onboardings. This is a visual-only change — it does not affect the daily breakdown or status system.

## Shading
- Empty cells (no status) for onboarding personnel get a brass tint
- Light mode: `rgba(184, 148, 62, 0.12)`
- Dark mode: `rgba(184, 148, 62, 0.15)`
- Cells with status colors are unaffected — status always takes priority
- Weekend/holiday cell backgrounds are unaffected

## Toggle
- Toggle switch in the calendar PageToolbar, labeled "Highlight onboarding"
- Per-user preference stored in localStorage (`calendar-highlight-onboarding-{userId}`)
- Defaults to ON
- No database changes needed

## Data Flow
- `DateCell` receives a new `isOnboarding` boolean prop (from `PersonnelRow`, which already has `isOnboarding`)
- `DateCell` logic: if no status entries AND `isOnboarding` is true AND toggle is on → apply brass tint background
- Calendar page manages toggle state and passes it through `Calendar` → `PersonnelRow` → `DateCell`

## What Doesn't Change
- Onboarding dot next to personnel name stays as-is
- Daily breakdown / TodayBreakdown counts are unaffected
- No new database columns, no new status types
- Status legend does not need an entry
