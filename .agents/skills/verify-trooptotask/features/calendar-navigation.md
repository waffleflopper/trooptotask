# Calendar navigation

A member moves through the availability calendar, narrows the people shown, and switches between the month and long-range views.

## Sub-features

- `calendar-entry`: enter Calendar from organization navigation.
- `calendar-month`: move with `Prev`, `Next`, month picker, and `Today`.
- `calendar-range`: switch to and from `3-Month` view.
- `calendar-filter`: narrow the grid with the group filter or searchbox.

## How to get to it (user POV)

Sign in with Calendar access and choose `Calendar` in the sidebar. The toolbar holds `Calendar group filter`, the personnel searchbox, `Prev`, the month/year button, `Next`, `3-Month`, and `Today`. `Bulk Status`, `Planning`, `Reports`, and more actions lead to separate workflows.

## Driving it with verify:app

1. Run `npm run --silent verify:app -- login calendarOperate`; keep its page ID as `PAGE`. From the fresh snapshot, click the `Calendar` link. Confirm the `/calendar` route and visible `Alpha`, `Bravo`, and `Unassigned` personnel groups.
2. Capture the current month label. Click `Next` from a new snapshot and confirm the month advances. Click `Today` and confirm the label returns to the current month; test `Prev` similarly. Use the month/year button to inspect the picker and dismiss it without changing the month when testing cancel.
3. Click `3-Month` and confirm the long-range view appears. Snapshot its return control and switch back to the month view.
4. Open `Calendar group filter` and select `Alpha`; confirm Able remains while Baker is absent. Clear the filter and confirm both groups return. Fill the searchbox with `Able`, confirm Baker is absent, then clear it.

## Gotchas

- Month labels depend on the test date; compare before and after instead of hardcoding September 2026.
- The grid contains many unnamed day cells. Use named toolbar controls for navigation and use the latest snapshot for any cell interaction.
- `calendarOperate` is a synthetic fixture role accepted by `login`; it has Calendar access that the ordinary `manager` fixture does not.
