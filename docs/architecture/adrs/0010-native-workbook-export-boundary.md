# ADR 0010: Native Workbook Export Boundary

Status: Accepted
Date: 2026-05-18

## Context

Some TroopToTask exports promise Excel output while generating Excel-compatible HTML with `.xls` filenames. Other exports already generate native `.xlsx` workbooks with `exceljs`, but workbook creation, download behavior, response headers, styling conventions, and tests are spread across feature and route files.

## Decision

Create a shared native workbook export module for user-facing data exports. The shared module owns workbook construction helpers, `.xlsx` MIME and filename conventions, browser download helpers, server response helpers, and workbook test utilities.

Feature modules still own feature-specific export models and layout decisions. Calendar should decide what a calendar month or long-range export contains, Duty Roster should decide how **Duty Roster Runs** and **DA6 Matrix** data are represented, Rating Scheme should decide rating-specific rows, and Settings should decide organization export contents. The shared module turns already-shaped feature export data into real native workbooks; it does not fetch data, check permissions, read route params, or own feature business rules.

Use Duty Roster as the first proof of concept for the shared module because issue #557 was reported from the Duty Roster surface and that export exercises richer workbook requirements, including roster rows and DA6 Matrix data. Migrate the remaining exports through follow-on issues instead of expanding the first slice across every feature.

CSV remains acceptable for import compatibility, but current CSV export actions are export drift. They should migrate to native `.xlsx` unless a future explicit product decision creates a true CSV export requirement.

## Rejected Or Deferred Alternatives

- Keep fixing each Excel export in place; rejected because it preserves scattered conventions and makes it easy to reintroduce HTML-backed Excel downloads.
- Move all export layout ownership into one sitewide export feature; rejected because feature modules know their own domain rows and operational meaning better than a generic export layer.
- Preserve CSV exports as a parallel export format; rejected because TroopToTask's intended user-facing data export format is Excel, and users who need CSV can convert from the downloaded workbook.
- Migrate every existing export in the first slice; deferred because Duty Roster is enough to prove the boundary while keeping the initial change reviewable.

## Consequences

Any user-facing data export action should eventually route through the native workbook module and download a valid `.xlsx` workbook. CSV import flows remain supported for compatibility. Print/PDF flows remain separate and should not be relabeled as native Excel output.
