# Retained Feature Rules

These behavior requirements were separated from CONTEXT.md during the September 2026 documentation audit. They supplement the [retained contracts](../stabilization/BASELINE.md#retained-contracts); canonical terms remain in the [glossary](../../CONTEXT.md#language).

## Training reports and readiness

- The Training Reports Excel (xlsx) workbook has five sheets for the briefing on screen: `Summary` (bottom-line numbers, goal and every filter as its display label), `Forecast` (each weekly point and lapse bucket, including a short final bucket), `Hot spots` (grid rows and Total with today values and drops per type), `Focus` (rendered sentences and what-if numbers) and `Requirements`. `Requirements` lists every applicable requirement in the filtered briefing that is not ready today or lapses in the horizon, in drill-down order, without pagination and regardless of any open cell or focus area. Quiet ready, optional, not-required and exempt requirements are absent. Names stay text cells.
- Readiness counts only applicable, required Training Types. Exempt and not-required cells contribute neither ready counts nor the denominator; optional types are excluded from the briefing and its workbook.
- Training and Critical Tasks share the ready rule: current and expiring requirements are ready. Training counts `current`, `warning-yellow` and `warning-orange`; Critical Tasks counts `current` and `expiring-soon`. `expired` and not-recorded requirements are not ready. The two features retain their own applicability and exemption rules.
- Readiness percent is `Math.round((ready / applicable) * 100)` for display only. With no applicable requirements the Training briefing has `null` readiness and shows an empty state; Critical Tasks readiness matrix cells also use `null` for not applicable.
- Currency depends on the report's as-of date and resolved expiration rules. Completion-based Training with no expiration window never expires; expiration-date-only Training uses its recorded expiration date. A null Critical Task expiration window uses the Organization default.

### Training Reports page

The Training Reports page and its three APIs (`api/training-reports`, `/detail`, `/export`) serve the briefing model below under `training.viewRecords`. The page shows the toolbar, Bottom line, Forecast chart, Hot-spot grid, Type risk bars, Focus areas and, once a cell or focus link is chosen, the Affected soldiers table. Export Excel downloads the workbook described above; Print brief calls the browser's print with the app chrome and controls hidden and the displayed filters stated under the title.

- The briefing state lives in URL search params: `view`, `group`, `rank`, repeated `mos`, `role` and `types`, `horizon` (30, 60, 90 or 180; default 90) and `rowsBy` (`group`, `mos` or `role`; default `group`). Each missing or invalid value falls back to its own default. Defaults are omitted, so the plain page URL is the default briefing, and a reload restores the same briefing.
- The server narrows the request to the caller's authorized roster and catalog: an unknown view, group or rank is dropped, MOS and duty roles keep only values present in the roster, and Types keep only required types in the selected view, in view column order. The page, its controls and its URL show this canonical input. Filter options carry display names only.
- `as of` is the server's current calendar day (`formatToday`); there is no as-of picker. The goal and the scope name come from the Organization's readiness goal and name, or the selected group's name.
- The first paint comes from the page server load. Filter changes refetch the summary API without a navigation; a superseded or abandoned request never replaces the briefing on screen. When a refresh fails, the controls return to the briefing on screen and the failure offers a retry of the attempted filters.
- A grid cell requests `/detail` with `scope=cell`, `type` and, except for the Total row, `row`; a focus area uses `scope=focus&focus=<key>`. The server re-derives the requirements from the same filters. A malformed scope is 400; a row, type or focus area the filters do not produce is 404. Pages default to 25 rows, cap the size at 100 and clamp past the last page. The page offers 25 or 100 rows with Previous/Next; changing scope or page size returns to page 1, the loaded page stays visible while another page of the same scope loads or fails, and Retry repeats the attempted page. Rows keep the server's order: not recorded first, then expiration date. No record ID appears in a URL.

### Briefing calculation model

- The caller supplies the filtered scope label, ordered selected-view types, as-of calendar date, horizon, goal and row grouping. Group and Rank filters select one value; MOS, duty role and type filters accept multiple values with OR matching and empty selections meaning all.
- The existing Training clock owns applicability, exemption and expiration. A ready requirement lapses on its first expired calendar date, the day after expiration. Weekly buckets and the final forecast include lapses on the horizon end date.
- Each grid row counts every filtered Soldier in it, including Soldiers with no applicable requirement. A cell is an upcoming hot spot when it loses at least the model's drop threshold (10 points) by the horizon end. Forecast axis ticks are today, the first of each month inside the horizon and the horizon end.
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
