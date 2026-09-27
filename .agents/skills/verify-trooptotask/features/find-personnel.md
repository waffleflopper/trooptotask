# Find personnel

A member finds a Soldier in the organization roster, switches between group and alphabetical views, and opens the person's record.

## Sub-features

- `roster-search`: match a person by name and return to the full roster by clearing the query.
- `roster-views`: switch between `Group` and `A-Z` presentations.
- `roster-open`: open a matching person's details.
- `roster-scope`: a group-scoped member sees only their assigned people.
- `roster-organization`: an Organization-scoped reader sees Alpha, Bravo, and unassigned people, but no foreign Person.

## How to get to it (user POV)

Sign in, choose `Personnel` in the organization navigation, and use `Search by name, rank, MOS, role, or group`. The `Group` and `A-Z` buttons are above the roster. Choose a person's row or its `Details` action to open the record.

## Driving it with verify:app

1. Run `npm run --silent verify:app -- login manager`; keep the returned page ID as `PAGE`. `take_snapshot` shows the searchbox, `Group` and `A-Z` buttons, and seeded `SPC Able, Synthetic`, `SPC Baker, Synthetic`, and `SPC Unassigned, Synthetic` rows.
2. From a fresh snapshot, use `tool fill` on the searchbox UID with `Able`. Snapshot again: `Open SPC Able, Synthetic` remains and Baker is absent. Focus the searchbox, press `Control+A` then `Backspace` with `tool press_key`, and confirm all seeded rows return. A native `fill` with an empty string can clear the displayed input without dispatching the search update.
3. Click the `A-Z` button UID and snapshot the alphabetical presentation. Click `Group` and confirm the `Alpha`, `Bravo`, and `Unassigned` headings return.
4. Choose the `Open SPC Able, Synthetic` row or its `Details` button using the current snapshot. Confirm the browser moved to that person's detail route and shows the same name. Return through the `Personnel` navigation link.
5. Sign in as `viewer` in its own page. The Organization roster must show Able, Baker, and Unassigned, while Foreign is absent. Capture the visible rows and an authenticated read-only request to the current `/personnel/__data.json`; compare the returned text against `personA`, `personB`, `personUnassigned`, and `personForeign` IDs from `$V fixture`. The first three must be present and the foreign ID absent.
6. Sign in as `scoped` in another page. Its Alpha roster must show Able and exclude Baker, Unassigned, and Foreign. Repeat the page-data ID comparison: only `personA` may appear. Save the visible and page-data observations together. A blank or failed data response is not a passing scope check.

## Gotchas

- `Edit` and `Details` repeat on each row. Choose the UID within the matching person's row.
- The fixture's `viewer` and `scoped` actors can read the roster but may not open a Personnel Record. Use `manager` for the record-opening step.
- Search results can change the visible rows without changing the URL; capture the search value and rows in the same snapshot.
- `Import`, `Add Person`, and archive are separate mutation journeys; their presence in the toolbar does not prove them.
