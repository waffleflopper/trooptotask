# Find personnel

A member finds a Soldier in the organization roster, switches between group and alphabetical views, and opens the person's record.

## Sub-features

- `roster-search`: match a person by name and return to the full roster by clearing the query.
- `roster-views`: switch between `Group` and `A-Z` presentations.
- `roster-open`: open a matching person's details.
- `roster-scope`: a group-scoped member sees only their assigned people.

## How to get to it (user POV)

Sign in, choose `Personnel` in the organization navigation, and use `Search by name, rank, MOS, role, or group`. The `Group` and `A-Z` buttons are above the roster. Choose a person's row or its `Details` action to open the record.

## Driving it with verify:app

1. Run `npm run --silent verify:app -- login manager`; keep the returned page ID as `PAGE`. `take_snapshot` shows the searchbox, `Group` and `A-Z` buttons, and seeded `SPC Able, Synthetic`, `SPC Baker, Synthetic`, and `SPC Unassigned, Synthetic` rows.
2. From a fresh snapshot, use `tool fill` on the searchbox UID with `Able`. Snapshot again: `Open SPC Able, Synthetic` remains and Baker is absent. Fill the same searchbox with an empty string and confirm all seeded rows return.
3. Click the `A-Z` button UID and snapshot the alphabetical presentation. Click `Group` and confirm the `Alpha`, `Bravo`, and `Unassigned` headings return.
4. Choose the `Open SPC Able, Synthetic` row or its `Details` button using the current snapshot. Confirm the browser moved to that person's detail route and shows the same name. Return through the `Personnel` navigation link.
5. Repeat the roster read with `npm run --silent verify:app -- login scoped` in its own page. Confirm Able is visible and Baker is absent; record both observations. This is a scope check, not a substitute for the manager path.

## Gotchas

- `Edit` and `Details` repeat on each row. Choose the UID within the matching person's row.
- Search results can change the visible rows without changing the URL; capture the search value and rows in the same snapshot.
- `Import`, `Add Person`, and archive are separate mutation journeys; their presence in the toolbar does not prove them.
