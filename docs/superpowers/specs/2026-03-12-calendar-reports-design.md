# Calendar Reports Design

**Date:** 2026-03-12
**Status:** Approved

## Overview

Add a reports section to the calendar feature, starting with a "Status Days Summary" report. The reports page lives at `/org/[orgId]/calendar/reports` and is gated to owner and admin roles only.

## Access & Navigation

- **Route:** `/org/[orgId]/calendar/reports`
- **Permission gate:** `data.isOwner || data.isAdmin`
- **Entry point:** "Reports" button in the calendar page toolbar, visible only to owner/admin
- **Report selector:** Dropdown at the top of the reports page to choose which report to run. Starts with "Status Days Summary" as the only option, but the UI accommodates future report types.

## Report: Status Days Summary

### Configuration Panel

1. **Date range** — start date and end date pickers
2. **Year shortcut** — year dropdown (current year + a few previous years). Selecting a year auto-fills start = Jan 1 and end = Dec 31 of that year. User can still manually adjust dates after selecting a year.
3. **Personnel selection** — multi-select with filter modes:
   - **All** — everyone in the org
   - **By name** — pick individuals from a searchable list
   - **By group** — select one or more groups
   - **By MOS** — select one or more MOS codes (derived from personnel data)
   - **By role** — select one or more clinic roles

### Output Table

- **Rows:** Selected personnel, sorted by rank then last name
- **Columns:** Each status type that has at least one day in the results, plus a "Total Days" column (total unique days with any status)
- **Cells:** Integer day count
- **Column headers:** Status name with color badge
- **Empty cells:** Show "—" for readability

### Day Counting Rules

- **Overlapping statuses:** Each status is counted independently. If a person has "Leave" Jan 1-5 and "TDY" Jan 4-7, days 4-5 count toward both Leave and TDY. Total days across statuses may exceed calendar days.
- **Total Days column:** Counts unique calendar days where the person has any status (deduplicates overlaps).
- **Weekends and special days:** Included in counts. If someone is on Leave over a weekend, those days count. This matches how availability data is stored (continuous date ranges).

### Data Source

- Availability entries for the selected date range and personnel, queried from the `availability_entries` table
- Counts computed client-side by expanding each entry's start/end range and tallying days per status type
- The calendar page server currently loads a 9-month window. The reports page will make its own targeted query for the requested date range via an API endpoint.

### Export

- "Export CSV" button in the report toolbar
- Exports the current table as-is: same rows, columns, and numbers

## Server-Side Requirements

### New API Endpoint

`GET /org/[orgId]/api/calendar-reports/status-days`

Query params: `startDate`, `endDate`

Returns all availability entries for the org within the date range. Permission check: owner or admin only.

This is needed because the report date range may extend beyond the 9-month window already loaded by the calendar page.

### No Database Changes

All data needed already exists in the `availability_entries` table. No new tables or columns required.

## File Organization

All report code lives in the calendar feature module:

```
src/features/calendar/
  components/
    reports/
      CalendarReports.svelte          — report page shell + report selector
      StatusDaysSummary.svelte        — config panel + output table
      StatusDaysSummaryExport.ts      — CSV export logic
  utils/
    statusDaysReport.ts               — day counting/aggregation logic
```

Route files:
```
src/routes/org/[orgId]/calendar/
  reports/
    +page.svelte                      — thin shell, imports CalendarReports
    +page.server.ts                   — permission gate, passes layout data
```

API:
```
src/routes/org/[orgId]/api/calendar-reports/
  status-days/+server.ts             — availability query endpoint
```
