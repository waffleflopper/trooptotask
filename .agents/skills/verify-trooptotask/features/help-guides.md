# Help guides

A signed-in member presses Help in the header, finds a short guide for the page they are on or by search, follows its
numbered steps to the pages they name, and closes the drawer with Back, the close button or Escape.

## Sub-features

- `list`: Help opens on `How do I…` with `On this page` guides first and `Things people miss` below, and a
  `Browse all N guides` footer. A guide that is already listed for the page is not repeated under `Things people miss`.
- `history`: the `?help` search param is the state. An empty value is the list and `?help=<id>` is a guide. Pressing Help
  pushes the list, opening a guide from the list pushes one more entry, and closing steps back over what Help pushed.
  Back goes guide, then list, then closed. The crumb from a guide that was pushed from the list steps back to the list
  instead of pushing, so history does not grow however often the list and a guide are swapped. A save that calls
  `invalidate()` resets SvelteKit's page state; Help puts its view and depth back on the same entry, so closing still
  steps back and Back does not reopen Help. A navigation to another path, or a step's link to the same page, is not
  restored.
- `focus`: opening puts focus in the drawer, opening a guide moves it to the guide title, and Escape or the close button
  returns it to the Help button, also when the drawer was opened from a load on `?help=` and nothing else had focus.
  After `Go there` lands, focus is inside the drawer.
- `scroll`: the drawer body is at the top whenever the list or a different guide shows.
- `search`: every word must appear in a guide's title, summary, area or keywords. `staff duty soldiers` finds
  `Add your own assignment types`.
- `steps`: a step on another page has a `Go there` link that keeps the guide open on that page. A step on the page you
  are already on reads `You're here`, judged by the page and by the step's own query params. A missing param counts as
  the page default, so `section` on Calendar settings defaults to `status` and `tab` on Bulk status to `add`. Both pages
  keep that param in the address bar: choosing a tab rewrites it in place (no new history entry, focus stays on the
  tab, Help keeps its depth) and the step follows. Embedded in Organization setup, the section stays local. The setup
  steps that embed an editor read `You're here` on their own `/setup/<slug>` page. A step whose feature is off is hidden
  and the others renumber. A step whose access the member lacks shows a short lock line under it.
- `deep-link`: a page loaded on `?help=<id>` opens that guide. Closing it drops the param and keeps other params.
- `access-note`: a member who cannot follow a guide still reads it and sees a lock note naming what they need. A guide
  that works across the whole unit tells a member limited to Groups so.
- `setup-page`: the Calendar step of Organization setup (`/setup/calendar`) lists the Calendar guides under `On this page`,
  and the Groups, Personnel, Training and Invite steps do the same for their guides.
- `load-failure`: if the Help chunk fails to load, the drawer frame stays with `Help could not load` plus `Reload page`
  and `Close help`. This is covered by unit tests only, because the owned production build serves the chunk.
- `feature-off`: a guide for a feature the unit switched off is hidden everywhere, and its `?help=` id shows the list.
- `unsaved-work`: Help opens, moves between guides and closes without asking about the page's unsaved work, because
  the page stays mounted: an import with a file chosen stays at its step with its file, and a Quick edit keeps its
  draft. A real navigation away (a link to another page, Back past the page) still asks.
- `page-back`: a page's own Back control steps past the entries Help pushed. The import's `Back to columns` with the Help
  list or a guide open lands on Columns with Help closed and no `help` in the URL, and the Training record sheet's close
  does the same for the entry that opened it.
- `layout`: no horizontal scroll at 1440, 900 or 390 px, and the header Help button stays visible, icon only at 390.

## How to get to it (user POV)

Choose `Help` in the header of any Organization page, next to `Feedback`. Below 640 px the button is the icon alone.
The drawer opens on the right below the header: 440 px wide from 640 px up and the full width below that. It overlays the
page and does not block it. The list has a search box, `On this page`, `Things people miss`, and a footer with
`Browse all N guides` and `Ask us`. A guide row's link is named by its title and summary. A row under
`Things people miss` is also prefixed by its area, such as `UNIT SETTINGS Limit a member to their own section`.

A guide shows a `Help · <Area>` crumb that returns to the list, its title, a lead, numbered steps with bold control
names, an optional note, a lock note when the member lacks access, a `Next:` link, `Copy link to this guide` and
`Tell us`. `Escape` closes the drawer only while focus is inside it.

## Driving it with verify:app

Preconditions: `doctor` passes on a fresh seeded worker and `$V fixture` reports Organization A. Actors:
`calendarConfigure` for Calendar settings (the `manager` fixture has Personnel only, so Calendar settings reads
`Access Restricted`), `orgOwner` and `orgAdmin` for Members settings, and `viewer` and `scoped` as members who cannot
follow an admin guide. Set up the shorthands once; `ev` prints the result of an `evaluate_script` function and `state`
reads the drawer and URL:

```bash
V="node .agents/skills/verify-trooptotask/helpers/control.mjs --worker $WORKER"
T="npm run --silent verify:app -- tool"
ev() { node -e 'console.log(JSON.stringify({pageId:+process.argv[1],function:process.argv[2]}))' "$1" "$2" | xargs -0 -I{} $T evaluate_script '{}' --text --worker "$WORKER"; }
state() { ev "$1" '() => { const a=document.querySelector("aside[aria-label=Help]"); return {path: location.pathname.replace(/^\/org\/[^/]+/,""), search: location.search, open: !!a, active: document.activeElement?.tagName+"|"+(document.activeElement?.getAttribute("aria-label")||document.activeElement?.innerText?.slice(0,30)), title: a?.querySelector("h2")?.innerText, scrollW: document.documentElement.scrollWidth, innerW: innerWidth} }'; }
$V actor calendarConfigure calendar/settings # PAGE and Organization from the output
$T resize_page "{\"pageId\":$PAGE,\"width\":1440,\"height\":900}" --worker "$WORKER"
```

The page has other `aside` elements, so every read of the drawer uses `aside[aria-label=Help]`. `$V click PAGE ROLE NAME`
needs the exact accessible name, so a guide row is its title plus summary. `take_snapshot` and a UID `click` match by
looking up the line, which is easier for rows (`link "Add your own assignment types Create duties like Staff Duty or CQ
and fill them in the duty planner."`). The crumb is `button "HELP · CALENDAR"` and the close button is
`button "Close help"`. Capture each state with `state`, a snapshot and a screenshot under
`.verification/evidence/verify-trooptotask/help-guides/`.

1. **List.** As `calendarConfigure` on `/calendar/settings`, `$V click $PAGE button "Help"`. Expect the URL to end
   `?help=`, `state` to show `active` `ASIDE|Help` with the title `HOW DO I…`, and `Help` to read `aria-expanded` true.
   Read the sections with
   `ev $PAGE '() => [...document.querySelectorAll("aside[aria-label=Help] section")].map(s => ({label: s.getAttribute("aria-label"), rows: [...s.querySelectorAll("a")].map(a => a.innerText.replace(/\n+/g, " | "))}))'`.
   `On this page` lists the seven Calendar guides starting with `Add your own assignment types`, and
   `Things people miss` lists `Limit a member to their own section` only, because the other missed guides are already
   on this page. The first `On this page` row is tinted. Scroll the drawer's list to `Things people miss` with
   `ev $PAGE '() => document.querySelector("aside[aria-label=Help] section[aria-label=\"Things people miss\"]").scrollIntoView({block:"end"})'`
   and capture the list at the top and that section.
2. **History.** From the list open `Add your own assignment types`. The URL ends `?help=add-assignment-types`, focus
   is on the guide title, and the guide's first step reads `Go there` (the step points at
   `?section=assignments` and the page shows `Status Types`). Run
   `$T navigate_page "{\"pageId\":$PAGE,\"type\":\"back\"}" --worker "$WORKER"`: the URL ends `?help=`, the title reads
   `HOW DO I…` and the drawer is open. Run it again: the URL has no `help`, the drawer is gone and focus is on the Help
   button. Then press Help, open a guide, press the crumb, open another guide and run `back` twice: the first lands on
   the list and the second leaves Help, with no `?help` entry left behind. A guide opens at its top. Reopen Help, scroll
   the list with
   `ev $PAGE '() => { document.querySelector("aside[aria-label=Help] .overflow-y-auto").scrollTop = 100 }'`, open the
   fifth row with a DOM click
   (`ev $PAGE '() => { [...document.querySelectorAll("aside[aria-label=Help] .overflow-y-auto a")][5].click() }'`; a
   native click scrolls the row into view first and changes the offset) and read the scroller's `scrollTop`, which is 0,
   so the lead paragraph is visible. Do the same with a guide scrolled to its end and `Next:`, and read 0 again.
   `state` reports the same scroller as `data-help-scroller`.
3. **Crumb, then close.** Press Help, open `Make your own status types`, choose `button "HELP · CALENDAR"` and then
   `button "Close help"`. The URL after the crumb ends `?help=`. After the close it has no `help`, the drawer is gone
   and focus is on the Help button. `history.length` is unchanged, so the close stepped back rather than pushed. Run
   `$T navigate_page "{\"pageId\":$PAGE,\"type\":\"back\"}" --worker "$WORKER"` once more: it leaves Settings for the
   entry before it (the owned browser's first page), not to a `?help` entry, so the close stepped back over exactly the
   entries Help pushed. Run it with `forward` to return.
4. **Escape.** Press Help and `state` shows focus on `ASIDE|Help`. Run
   `$T press_key "{\"pageId\":$PAGE,\"key\":\"Escape\"}" --worker "$WORKER"`: the drawer closes, the URL has no `help`
   and `active` is `BUTTON|Help`. Repeat with the search box focused after `fill`; Escape closes there too.
5. **Search.** Press Help, `$T fill "{\"pageId\":$PAGE,\"uid\":\"$UID\",\"value\":\"staff duty soldiers\"}"` on
   `searchbox "Search guides"`, and read `aside[aria-label=Help] [role=status]`, which says `2 GUIDES MATCH`. The rows are
   `Choose who pulls a duty` then `Add your own assignment types`, each with the `CALENDAR` area label. Capture it.
6. **Steps.** On `/calendar/settings` open `Add one status to many people` from the list. Its two `Go there` links point
   to `/calendar/bulk?tab=add&help=bulk-statuses` and `?tab=remove&help=bulk-statuses`. Click the first. The page becomes
   `Bulk status`, the URL keeps `help=bulk-statuses`, the drawer stays open on that guide, and the steps that target
   this page now read `You're here`, and the `tab=remove` step still reads `Go there` because `tab` is `add`. Open
   `Make your own status types` on `/calendar/settings`: its first step already reads `You're here` because `section`
   defaults to `status`, and it has no `Go there` link. In step 2's guide the first step reads `Go there` until the URL
   has `?section=assignments`. On `/calendar/settings` open `Add your own assignment types` from the list and press its
   `Go there`: the page switches to `Assignment Types`, the URL is `?section=assignments&help=add-assignment-types` and
   step 1 reads `You're here`. Choose the `Status Types` tab by hand: the URL becomes `?section=status&...`, step 1
   reads `Go there`, `history.length` is unchanged and focus stays on the tab. Back twice then goes to the list and
   closes Help.
   **Save keeps Help's depth.** On `/calendar/bulk?tab=add` press Help, open `Add one status to many people`, select
   `SPC Able, Synthetic` and use `Add to 1 person` (it calls `invalidate`). The drawer stays open on the guide. Press
   `Close help`: the URL is `?tab=add` and one `back` lands on the entry before Bulk status, not on a `?help` entry.
   Undo the row with the `Remove` tab (`Review Matching Entries`, `Confirm Removal`) and confirm
   `$V rows availability_entries orgA` is back to its six seeded rows.
7. **Reload.** On the Bulk status URL from step 6, `$T navigate_page "{\"pageId\":$PAGE,\"type\":\"reload\"}"`. The
   guide is open again with the same title and focus is on `ASIDE|Help`. Choose `Close help`: the URL becomes
   `/calendar/bulk?tab=add`, with `tab` kept and `help` dropped.
8. **Access note.** `$V actor orgOwner settings/members`, press Help, open `Limit a member to their own section` and
   capture it for `Members settings`: the first step reads `You're here`, and there is no lock note. Under
   `Manage` on a member, the sheet's `Groups`, `Selected`, `Choose Groups`, `Preset` and `Area by area` are the bold
   names; Cancel it. Then `$V actor viewer personnel` and `$V actor scoped personnel`. In each press Help and open
   `UNIT SETTINGS Limit a member to their own section` under `Things people miss`. Read the lock note with
   `ev $PAGE '() => [...document.querySelectorAll("aside[aria-label=Help] p")].filter(p => p.querySelector("svg.lucide-lock")).map(p => p.innerText)'`:
   `Only owners and admins can do this. Don't see the button? Ask a unit admin.` Scroll the drawer's scroller to its end
   before the screenshot, because the note sits below the first screen. `$V actor orgAdmin settings/members` on
   `?help=limit-member-to-groups` shows no lock note. A lane guide uses the lane wording:
   `viewer` on `/calendar?help=add-assignment-types` reads `You need Calendar Manage access across the whole unit.`
   A Group-limited member sees the whole-unit note. `$V actor calendarScoped calendar` (Calendar Update, Groups scope),
   then navigate to `/calendar?help=fill-duty-roster`, scroll the drawer to its end and read the lock note:
   `This works across the whole unit, and your access covers only your Groups. Don't see the button? Ask a unit admin.`
   `$V actor calendarScopedConfig calendar/settings` with `?help=add-assignment-types` reads the same note, because
   Manage in Groups scope is still not the whole unit. In `open-soldier-record`, the Training completion step shows a
   lock line for a member without Training Update access and is gone when Training is off.
9. **Feature off.** As `orgOwner` on `?help=add-training-types`, the title reads
   `ADD THE TRAINING YOUR UNIT TRACKS`. Switch Training off in the owned provider with
   `$V settings-request $PAGE orgA organization/settings '{"featureSwitch":{"feature":"training","on":false}}'`
   (`status` 200; `$V rows organizations orgA` shows `disabled_features` `["training"]`). Navigate to
   `/calendar/settings?help=add-training-types`: the drawer shows `HOW DO I…`, its footer reads `Browse all 18 guides`,
   and after choosing it the `All guides` section has no Training heading and no training guide. Search `training`
   reports `0 GUIDES MATCH`. Restore with the same request and `"on":true`, confirm `disabled_features` is `[]` and the
   same URL shows the training guide again. The other guides tied to a switch are `build-critical-task-library`
   (Critical tasks), `build-onboarding-template` and `start-onboarding` (Onboarding) and `track-rating-chain`
   (Evaluations).
10. **Layout.** At each of 1440x900, 900x800 and 390x844 (`resize_page`), navigate to `/calendar/settings?help=` and
    read the metrics with
    `ev $PAGE '() => { const a=document.querySelector("aside[aria-label=Help]"); const r=a.getBoundingClientRect(); const h=document.querySelector("[data-help-trigger]"); const hr=h.getBoundingClientRect(); return {scrollW: document.documentElement.scrollWidth, innerW: innerWidth, drawer: {l: r.left, r: r.right, w: r.width}, helpRight: hr.right, helpText: h.innerText.trim()} }'`.
    `scrollW` equals `innerW`; the drawer is 440 px wide and flush right at 1440 and 900, and spans 0 to 390 at 390;
    the Help button sits inside the viewport and reads `Help` at 1440 and 900 and nothing at 390. At 390 open
    `Add your own assignment types` and scroll to its end: the five steps, the note and the footer fit with no sideways
    scroll. Capture the list and a guide at 1440 and 390, and a guide at 900.
11. **Content.** For a guide, compare each bold name against the real page. `Add your own assignment types`: on
    `?section=assignments` choose `Add new` and read the sheet (`Full name`, `Short code` with `Up to 5 letters`,
    `Color`, `Assigned to` with `Person` and `Group`, `Who pulls this duty`, `Add Assignment Type`), then Cancel.
    `Make your own status types`: on `?section=status` choose `Add new` and read the composer (`Name`,
    `One-day label` with `Up to 3 letters`, `Color`, `On duty rosters` with `Still available`, `Away`, `Other duty` and
    `Misconduct`, `Add status type`), then Cancel. `Add one status to many people`: on `/calendar`, `Bulk Status` opens a
    menu with `Add Bulk` and `Remove Bulk`; `/calendar/bulk?tab=add` has `Status`, `Dates`, `Note`, `Who` and
    `Add to N people`, and a `Remove` radio. `Limit a member to their own section` is read in step 8.
12. **Setup page.** `$V actor orgOwner settings/general`, then
    `$T navigate_page "{\"pageId\":$PAGE,\"type\":\"url\",\"url\":\"<origin>/org/<org>/setup/calendar\"}" --worker "$WORKER"`
    (`actor` does not accept `setup/calendar` as a destination). Press Help: the list says `On this page` with the four
    Calendar guides (`Add your own assignment types`, `Choose who pulls a duty`, `Show a duty as a calendar lane`,
    `Make your own status types`). Open `Add your own assignment types`: step 1 reads `You're here` even though the
    embedded editor shows `Status Types`, because the setup page keeps the section in local state and the URL says
    nothing; choosing the `Assignment Types` tab there leaves the URL as it was. Capture the list and the guide.
13. **Focus.** Load `/calendar/settings?help=` in a fresh `navigate_page` (so nothing but the page body had focus), press
    `Close help` and read `state`: `active` is `BUTTON|Help`. Then open `Add one status to many people`, click its first
    `Go there` and read `state` right after the page changes: `active` is inside the drawer (the guide title or a control
    in it), not `BODY`.
14. **Dark theme.** Choose `Toggle theme`, capture a guide and the list, then choose it again. The drawer's black header
    and its body keep readable contrast.
15. **Unsaved work.** As `manager` on `/personnel/import`, `upload_file` a two-row CSV (`Rank,Name,Group` with synthetic
    names) onto `Drop a spreadsheet here`; the stepper reads `COLUMNS`. Press Help: no `Leave this import?` dialog, the
    URL ends `?help=` and the drawer is open. Open `Import your roster from a spreadsheet`, press the crumb and press
    `Close help`: the drawer is gone, `state` shows no dialog, the stepper still reads `COLUMNS` and the file's rows are
    still on the page. Press Help again and use `back` instead of the close button: also no dialog. Then choose the `Home`
    link: `Leave this import?` appears; choose `Keep importing` to close it, and the import stays on Columns. With Help opened and closed on Review (`Review 2 rows`), browser Back steps Review to Columns to File with no
    confirmation; one more Back to `/personnel` asks `Leave this import?`; choose `Keep importing` again before going on. Reach the import from the `Import` button, not
    `navigate_page`, because a document load before it makes that Back unload the page instead of asking. Repeat on `/personnel` with a row's
    `Quick edit`: change MOS, press Help, open a guide, press `Close help`: the edit is still open with the changed MOS
    and no dialog; then choose the `Home` link, and `Save changes first?` appears. Choose its `Cancel`, then `Cancel` the
    edit, which saves nothing.

16. **Page Back past Help.** As `manager`, reach `/personnel/import` with the `Import` link, upload the two-row CSV from
    step 15 and press `Review 2 rows`. Press Help (depth 1, `?help=`), then open a guide (depth 2). Press
    `Back to columns`: the stepper reads `COLUMNS`, the drawer is gone and the URL has no `help`. Repeat with only the
    list open, and once with Help closed, which still steps to Columns. One `back` after each lands on `FILE`, not on a
    `?help` entry. At 1440 the drawer covers `Back to columns`, so a pointer click hits the drawer. Focus the button with
    `ev` and use native `press_key` `Enter`, or press Close help first. On `/training` as `trainingConfigure`, the open
    record sheet is modal and covers the header Help button at every width, and its focus trap keeps `Enter` inside it,
    so Help cannot be pressed after the sheet. Open Help, then a Soldier's name: the URL becomes `?person=<id>` with the
    drawer hidden, because opening the sheet replaces Help's state. Close the sheet: the URL returns to the `?help=` or
    `?help=<id>` entry and Help reopens at the same view. `Close help` then drops `help`, and one more `back` leaves
    Training for the entry before it, so neither `person` nor `help` is left behind. Do not press `Enter` with focus
    unknown while the sheet is open, because it can land on `Record all N today`.
17. **Close keeps the view.** As `orgOwner` at 1440x900, with `history.length` read from `state` at each stop. Run each
    case twice, once with a guide open (depth 2) and once with only the list (depth 1).
    - Bulk status: on `/calendar/bulk` press Help, open `Add one status to many people` and switch to `Remove`. The
      drawer covers the `Remove` radio at 1440, so focus it with `ev` and press `Space` with `press_key`; the URL gains
      `tab=remove` beside `help`. Tick `SPC Able, Synthetic` (`1 of 3 selected`) and press `Close help`. Expect the
      `Remove` tab, `1 of 3 selected` with Able still ticked, `?tab=remove` and no `help`. One `back` then lands on the
      entry before Bulk status with no `?help` entry.
    - Calendar settings: on `/calendar/settings` press Help, open `Add your own assignment types`, choose the
      `Assignment Types` tab by hand (not the step's `Go there`) and press `Close help`. Expect `?section=assignments`,
      the `Assignment Types` tab selected and no `help`. One `back` leaves Settings the same way.
    - No change: press Help and `Close help` without switching a tab, on Settings and on Bulk status with Able ticked on
      `Add`. The URL is `/calendar/settings` or `/calendar/bulk` with no `tab` or `section`, the Add selection stays
      `1 of 3 selected`, and one `back` leaves the page as before.

## Gotchas

- Run steps 8 and 9 as the actors named; `manager` cannot open Calendar settings. A settings request needs an
  owner's page, so use the `orgOwner` page for step 9.
- A native `click` scrolls its target into view before it clicks. To test scroll offset or an element below the first
  screen, scroll the drawer's `.overflow-y-auto` scroller with `evaluate_script` and click the row from the DOM.
- `history.length` does not fall when an entry is popped. Prove what Back did from the URL and the drawer state, and
  prove how many entries a close removed by the one extra Back in step 3.
- `Go there` and `You're here` are judged from the page path and the step's query params, with a missing param counting
  as the page default. The one exception is a setup page, which cannot expose its editor's section, so a step that
  embeds an editor reads `You're here` on `/setup/<slug>` whatever section shows.
- `take_screenshot --save` writes the MCP response as JSON with the image as base64, not a PNG. Decode the `image` item
  with `base64 -d` or Python, and delete the saved JSON between shots, because a leftover file gives you the previous
  picture again.
- An id in `?help=` that names no available guide, such as a switched-off feature's, shows the list and leaves the URL as
  typed.
- Switching a feature uses the disposable provider only. Restore it before the next journey, and `$V rows` the change
  both ways.
- The sidebar role label for `calendarConfigure` reads `member`; the guide access check uses the role and the Calendar
  lane, not that label.
