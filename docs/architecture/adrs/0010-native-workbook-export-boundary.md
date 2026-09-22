# ADR 0010: Native Workbook Export Boundary

Status: Accepted
Date: 2026-05-18

## Context

Some TroopToTask exports promise Excel output while generating Excel-compatible HTML with `.xls` filenames. Other exports already generate native `.xlsx` workbooks with `exceljs`, but workbook creation, download behavior, response headers, styling conventions, and tests are spread across feature and route files.

## Decision

Create a shared native workbook export module for user-facing data exports. The shared module owns workbook construction helpers, `.xlsx` MIME and filename conventions, browser download helpers, server response helpers, and workbook test utilities.

Feature modules still own feature-specific export models and layout decisions. Calendar decides what a calendar month or long-range export contains, Rating Scheme decides rating-specific rows, and Settings decides organization export contents. The shared module turns already-shaped feature export data into real native workbooks; it does not fetch data, check permissions, read route params, or own feature business rules.

Duty Roster was the first proof of concept because issue #557 concerned that surface and its roster/DA6 Matrix workbook requirements. Phase 05 D01 removes that feature exporter; the shared workbook boundary and retained Calendar, Personnel, Rating Scheme and Settings exports remain.

CSV remains acceptable for import compatibility, but current CSV export actions are export drift. They should migrate to native `.xlsx` unless a future explicit product decision creates a true CSV export requirement.

## Rejected Or Deferred Alternatives

- Keep fixing each Excel export in place; rejected because it preserves scattered conventions and makes it easy to reintroduce HTML-backed Excel downloads.
- Move all export layout ownership into one sitewide export feature; rejected because feature modules know their own domain rows and operational meaning better than a generic export layer.
- Preserve CSV exports as a parallel export format; rejected because TroopToTask's intended user-facing data export format is Excel, and users who need CSV can convert from the downloaded workbook.
- Migrate every existing export in the first slice; initially deferred because Duty Roster proved the boundary while keeping that first change reviewable.

## Consequences

Any user-facing data export action should eventually route through the native workbook module and download a valid `.xlsx` workbook. CSV import flows remain supported for compatibility. Print/PDF flows remain separate and should not be relabeled as native Excel output.
