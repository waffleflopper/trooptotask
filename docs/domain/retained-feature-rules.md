# Retained Feature Rules

These behavior requirements were separated from CONTEXT.md during the September 2026 documentation audit. They supplement the [retained contracts](../stabilization/BASELINE.md#retained-contracts); canonical terms remain in the [glossary](../../CONTEXT.md#language).

## Training reports and readiness

- A Training report includes one status cell for every selected Soldier and Training Type pairing, including optional types selected for detail or Excel (xlsx) output.
- Readiness counts only applicable, required Training Types. Exempt and not-required cells remain available for display but contribute neither ready counts nor the denominator; optional types are excluded even when visible.
- Training and Critical Tasks share the ready rule: current and expiring requirements are ready. Training counts `current`, `warning-yellow` and `warning-orange`; Critical Tasks counts `current` and `expiring-soon`. `expired` and not-recorded requirements are not ready. The two features retain their own applicability and exemption rules.
- A report's status filter narrows detail and Excel (xlsx) rows. Its readiness still reflects the selected Soldiers and Training Types before status filtering.
- Training Excel (xlsx) export includes the full filtered, sorted result, independent of detail pagination.
- Training Type column sorting uses status severity: expired, warning-orange, warning-yellow, not-completed, current, not-required, exempt, reversing that order for descending sort.
- Readiness percent is `Math.round((ready / applicable) * 100)`. With no applicable requirements, Training reports show `0`; Critical Tasks readiness matrix cells use `null` for not applicable. These are surface-specific conventions, not permission to impose one empty-state value everywhere.
- Non-compliance percent is rounded from its own non-compliant/applicable count, not calculated as `100 - readinessPercent`; rounding can make the figures non-complementary.
- Currency depends on the report's as-of date and resolved expiration rules. Completion-based Training with no expiration window never expires; expiration-date-only Training uses its recorded expiration date. A null Critical Task expiration window uses the Organization default.

### Briefing calculation model

The pure Training briefing model is implemented for slice 1502 of issue 1433. The current report page and API still use the existing report model. Their replacement and redesigned exports remain for slices 1503 and 1504.

- The caller supplies the filtered scope label, ordered selected-view types, as-of calendar date, horizon, goal and row grouping. Group and Rank filters select one value; MOS, duty role and type filters accept multiple values with OR matching and empty selections meaning all.
- The existing Training clock owns applicability, exemption and expiration. A ready requirement lapses on its first expired calendar date, the day after expiration. Weekly buckets and the final forecast include lapses on the horizon end date.
- All bands, ordering, drop alerts, cliff thresholds and focus selection use requirement counts before rounding. Percentages round only for display. An empty denominator yields `null` readiness and the `none` band in this model.
- Focus selection scores recovered population requirements, suppresses at least 50% overlap with the union of already selected requirements, excludes recovery below one percentage point and returns at most three areas. Row what-if percentages use that row's denominator; wave and standing-gap percentages use the population denominator.
- A wave's biggest-hit row uses the horizon loss among its dominant types. Its month is the most common lapse month, with the earliest month winning ties. Standing-gap eligibility uses applicable requirements for that type; its sentence percentage uses affected Soldiers across the filtered population.
- Cell and selected-focus details are re-derived from the same input. Requirements use Person and Training Type identities, without record IDs. A valid empty cell returns an empty list; an unknown row, type or stale focus key returns `null`.

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
