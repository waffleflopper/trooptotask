# Group focus and nested bands

A reader narrows Personnel and Calendar to one Group with the Group focus control, the focus follows them between
screens in the address, and nested Groups draw as bands inside their parent.

## Sub-features

- `focus-pick`: the `Group:` trigger opens a tree of the reader's Groups with subtree counts; picking one writes
  `?group=<id>` (or `?group=unassigned`) and replaces the history entry.
- `focus-carry`: the sidebar's Home, Calendar and Personnel links carry `?group=`; Events & Taskings does not.
- `focus-reload`: a reload keeps the focus.
- `focus-drill`: a band's `Show only this Group` pushes a history entry, so Back returns to the wider focus.
- `focus-unavailable`: a `?group=` for a deleted Group or one the reader cannot see shows `Group unavailable` with
  `Clear` and no People; it never widens to the whole unit.
- `focus-scoped`: a reader whose whole view is one Group with no sub-groups sees a static label, no bands, no pins and
  no `A-Z`/`Group` toggle.
- `nested-bands`: in a nested tree each Group's own People sit under its band before its sub-group bands; sub-group
  bands are slimmer and indented 16 px per depth; the top band's name is the path from the focus
  (`2nd Platoon › 1st Squad`) and only that band sticks while the roster or matrix scrolls.
- `nested-pins`: only Organization-wide readers pin, only top-level Groups carry a pin, and pins order the top-level
  bands on Personnel and Calendar.

## How to get to it (user POV)

Choose `Personnel` or `Calendar`. The first control in the toolbar row is the `Group: <label> <count>` button. It opens
a popover (a bottom sheet titled `GROUP` below 640 px) with the `Find a Group` combobox and a tree: `Whole unit` with
everyone the reader can see, each Group indented under its parent with its subtree count, and `Unassigned` set apart at
the end (disabled when nobody is unassigned). The chosen node is checked with its ancestors open and the rest collapsed;
ArrowRight and ArrowLeft open and close, Enter picks. The trigger's label is the path (`2nd Platoon › 1st Squad`).
Personnel's eyebrow names a scoped reader's one Group; Calendar's eyebrow reads
`Calendar · <Organization> · <path> · N personnel` and its `N of M available` headline counts the focused People. Each
Personnel band's `⋯` menu (`Group actions for <path>`) holds `Show only this Group` for any band other than the focus.

## Driving it with verify:app

Preconditions: doctor passes on worker 1 or 2; `$V fixture` gives Organization A. Seed a three-level tree from a
signed-in Organization-wide page with Personnel configuration (`$V actor orgOwner personnel`) through `evaluate_script`
`fetch` calls in that page: `POST /org/<orgA>/api/groups` with `{"name","parentId"}` for `2nd Platoon` (root),
`1st Squad` and `2nd Squad` under it, and `Alpha Team` and `Bravo Team` under `1st Squad`; then
`POST /org/<orgA>/api/personnel` with `{rank:"SPC",firstName,lastName,groupId,clinicRole}` for Diaz and Webb in 2nd
Platoon, Lee in 1st Squad, Brooks, Moss, Nguyen and Ortiz in Alpha Team, Kim in Bravo Team and Patel in 2nd Squad. The
fixture's Alpha (Able), Bravo (Baker) and the unassigned Person stay, so `Whole unit` reads 12. Keep the returned IDs.
Use `manager` with `$V calendar-grant manager view` for the Calendar steps and restore it afterwards.

1. **Pick.** As `manager` at 1440x900 on Personnel in `Group` view, click `Group: Whole unit 12`, fill `Find a Group`
   with `1st` and click treeitem `1st Squad 6`. The address gains `?group=<1st Squad>` and `history.length` is
   unchanged. The trigger reads `Group: 2nd Platoon › 1st Squad 6`, the H1 count `6`, the footer `6 of 6 shown`, and the
   bands run `2nd Platoon › 1st Squad 6` (level 0, Lee under it), `Alpha Team 4`, `Bravo Team 1` (level 1). Picking
   `Alpha Team 4` the same way also leaves `history.length` unchanged.
2. **Reload and drill.** Reload: the trigger and bands are unchanged. Open
   `Group actions for 2nd Platoon › 1st Squad › Alpha Team` and choose `Show only this Group`: `?group=<Alpha Team>`,
   `history.length` grows by one and the trigger reads `Group: 2nd Platoon › 1st Squad › Alpha Team 4`. Back returns to
   `?group=<1st Squad>` with no dialog open.
3. **Carry.** Read the sidebar links: Home, Calendar and Personnel end in `?group=<1st Squad>`, Events & Taskings does
   not. Click `Calendar`: the eyebrow reads
   `Calendar · Verification Organization A · 2nd Platoon › 1st Squad · 6 personnel`, the headline `6 of 6 available`,
   and the bands (`[data-band-level]`) run `0: 2nd Platoon › 1st Squad 6`, `1: Alpha Team 4`, `1: Bravo Team 1`. Pick
   `2nd Platoon 9`: bands `0: 2nd Platoon 9 Pin`, `1: 1st Squad 6`, `2: Alpha Team 4`, `2: Bravo Team 1`,
   `1: 2nd Squad 1`; Diaz and Webb sit under the top band before `1ST SQUAD`. Band heights are 35, 28 and 26 px by
   depth, and only the top band has `Pin`.
4. **Sticky top band.** At 1024x640 on Calendar set `.calendar-body` `scrollTop` to 200:
   `[data-testid= calendar-stuck-band]` reads `2nd Platoon 9 Pin` at the body's top edge and the band is drawn once. On
   Personnel at the same size scroll the roster: the level-0 band's row sticks 40 px below the roster top, under the
   column header. `scrollWidth` equals the viewport on both pages.
5. **Unavailable.** Open `/org/<orgA>/personnel?group=00000000-0000-4000-8000-000000000000` at 390x844: the trigger
   reads `Group: Unavailable`, an alert reads `Group unavailable` with `Clear`, the roster has no rows and the H1 shows
   no count. `Clear` drops `?group=` and the roster returns to `Group: Whole unit 12`. Calendar shows the same alert in
   place of the matrix.
6. **Pins.** As `manager` with no pins, Personnel's top bands run `2nd Platoon`, `Alpha`, `Bravo`, `Unassigned` and the
   only pin controls are `Pin 2nd Platoon`, `Pin Alpha` and `Pin Bravo`. `Pin Bravo` puts Bravo first on Personnel and
   on Calendar (`0: Bravo 1 Pinned`); unpin it afterwards.
7. **Scoped reader.** As `orgOwner` in `Settings` → `Members`, set `orgMember`'s Groups to `Selected` → `Alpha Team`
   only (see [member access](organization-member-access.md)). In `$V actor orgMember personnel` at 1440 and 390 the
   eyebrow reads `Verification Organization A · Alpha Team`, the toolbar shows the static `Alpha Team 4` with nothing to
   open, the roster lists Brooks, Moss, Nguyen and Ortiz with no band and no pin, and `scrollWidth` equals the viewport.
   Restore `orgMember`'s Groups to `Alpha` and reload Members to confirm.
8. **390.** As `manager` on Personnel at 390x844 open the trigger: a bottom sheet titled `GROUP` with `Find a Group` and
   the tree, `scrollWidth` 390 with the sheet open; Escape closes it.

Clean up: archive and then permanently delete the seeded People, delete the five Groups (children first), run
`$V clean-seeds` and `verify:app cleanup --worker <N>`, or restart the worker.

## Gotchas

- Loads ignore `?group=`; the focus narrows on the client, so a focus change sends no page-data request.
- The ordinary `manager` has no Calendar access until `$V calendar-grant manager view`, and its sidebar then shows no
  Calendar link to carry the focus through.
- The Members scope chips list every Group by name with no path, so `Alpha` and `Alpha Team` are different chips.
- A scoped reader's label is the Group's name only; Groups above their scope stay hidden, so no ancestor path shows.
- In a flat Organization nothing draws nested: bands have no count beside the name on Calendar and no sticky top band.
