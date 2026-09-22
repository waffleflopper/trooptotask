# Retained Feature Rules

These behavior requirements were separated from CONTEXT.md during the September 2026 documentation audit. They supplement the [retained contracts](../stabilization/BASELINE.md#retained-contracts); canonical terms remain in the [glossary](../../CONTEXT.md#language).

## Training reports and readiness

- A Training report includes one status cell for every selected Soldier and Training Type pairing, including optional types selected for detail or CSV output.
- Readiness counts only applicable, required Training Types. Exempt and not-required cells remain available for display but contribute neither ready counts nor the denominator; optional types are excluded even when visible.
- Training counts only `current` as ready. Critical Tasks counts `current` and `expiring-soon`; the two features retain their own applicability and exemption rules.
- A report's status filter narrows detail and CSV rows. Its readiness still reflects the selected Soldiers and Training Types before status filtering.
- Training CSV export includes the full filtered, sorted result, independent of detail pagination.
- Training Type column sorting uses status severity: expired, warning-orange, warning-yellow, not-completed, current, not-required, exempt, reversing that order for descending sort.
- Readiness percent is `Math.round((ready / applicable) * 100)`. With no applicable requirements, Training reports show `0`; Critical Tasks readiness matrix cells use `null` for not applicable. These are surface-specific conventions, not permission to impose one empty-state value everywhere.
- Non-compliance percent is rounded from its own non-compliant/applicable count, not calculated as `100 - readinessPercent`; rounding can make the figures non-complementary.
- Currency depends on the report's as-of date and resolved expiration rules. Completion-based Training with no expiration window never expires; expiration-date-only Training uses its recorded expiration date. A null Critical Task expiration window uses the Organization default.

## Personnel record URLs

- A Personnel Record's route slug derives from `lastName-firstName`, excluding rank, and is unique within its Organization. Name collisions receive numeric suffixes such as `smith-john-2`.
- A name change regenerates only that person's slug and re-evaluates its collision suffix; other personnel URLs are unaffected.
- The internal Personnel Record identity stays stable across name changes. Old slugs have no redirects.

## Personnel documents and counseling

- Documents accept PDF, JPEG, PNG, and HEIC files, including the supported HEIF representation. Each file may be at most 10 MiB; the product labels this limit 10 MB.
- The per-Soldier document storage cap defaults to 100 MiB and is configurable at Organization level. File limits and private-file protections remain subject to retained contracts R5/R7.
- A Counseling Record contains a completed session's PDF, conducted date, title, optional summary, and uploader metadata. It does not add signature tracking, status management, or form building.

## Calendar availability imports

- Spreadsheet imports validate rows, match Personnel Records by name with Rank disambiguation, and resolve Status Types by name with an explicit skip choice.
- A Rank that conflicts with an otherwise unique name match produces a reviewable warning rather than blocking that row's import.
- Partial submission reports attempted and inserted entry counts so the operator can distinguish saved entries from failures.
