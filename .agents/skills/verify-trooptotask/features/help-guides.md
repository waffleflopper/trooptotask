# Help guides

A signed-in member presses Help in the header, finds a short guide for the page they are on or by search, follows its
numbered steps to the pages they name, and closes the drawer with Back, the close button or Escape.

## Sub-features

- `list`: Help opens on `How do I…` with `On this page` guides first and `Things people miss` below, and a
  `Browse all N guides` footer. A guide that is already listed for the page is not repeated under `Things people miss`.
- `history`: the `?help` search param is the state. An empty value is the list and `?help=<id>` is a guide. Pressing Help
  pushes the list, opening a guide from the list pushes one more entry, and closing steps back over what Help pushed.
  Back goes guide, then list, then closed.
- `focus`: opening puts focus in the drawer, opening a guide moves it to the guide title, and Escape or the close button
  returns it to the Help button.
- `search`: every word must appear in a guide's title, summary, area or keywords. `staff duty soldiers` finds
  `Add your own assignment types`.
- `steps`: a step on another page has a `Go there` link that keeps the guide open on that page. A step on the page you
  are already on reads `You're here`.
- `deep-link`: a page loaded on `?help=<id>` opens that guide. Closing it drops the param and keeps other params.
- `access-note`: a member who cannot follow a guide still reads it and sees a lock note naming what they need.
- `feature-off`: a guide for a feature the unit switched off is hidden everywhere, and its `?help=` id shows the list.
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
looking up the line, which is easier for rows (`link "Add your own assignment types Create duties like Staff Duty, CQ
or a detail and fill them in the duty planner."`). The crumb is `button "HELP · CALENDAR"` and the close button is
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
   is on the guide title, and the guide's first step reads `You're here`. Run
   `$T navigate_page "{\"pageId\":$PAGE,\"type\":\"back\"}" --worker "$WORKER"`: the URL ends `?help=`, the title reads
   `HOW DO I…` and the drawer is open. Run it again: the URL has no `help`, the drawer is gone and focus is on the Help
   button. A guide opens at its top. Reopen Help, scroll the list with
   `ev $PAGE '() => { document.querySelector("aside[aria-label=Help] .overflow-y-auto").scrollTop = 100 }'`, open the
   fifth row with a DOM click
   (`ev $PAGE '() => { [...document.querySelectorAll("aside[aria-label=Help] .overflow-y-auto a")][5].click() }'`; a
   native click scrolls the row into view first and changes the offset) and read the scroller's `scrollTop`, which is 0,
   so the lead paragraph is visible.
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
   this page now read `You're here`. On the Assignment Types guide of step 2 the matching step already reads
   `You're here` and has no `Go there` link.
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
   `viewer` on `/calendar?help=add-assignment-types` reads `You need Calendar Manage access.`
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
12. **Dark theme.** Choose `Toggle theme`, capture a guide and the list, then choose it again. The drawer's black header
    and its body keep readable contrast.

## Gotchas

- Run steps 8 and 9 as the actors named; `manager` cannot open Calendar settings. A settings request needs an
  owner's page, so use the `orgOwner` page for step 9.
- A native `click` scrolls its target into view before it clicks. To test scroll offset or an element below the first
  screen, scroll the drawer's `.overflow-y-auto` scroller with `evaluate_script` and click the row from the DOM.
- `history.length` does not fall when an entry is popped. Prove what Back did from the URL and the drawer state, and
  prove how many entries a close removed by the one extra Back in step 3.
- `Go there` and `You're here` are judged from the page path alone. A guide opened on `/calendar/settings` reads
  `You're here` on a step that says to select `Assignment Types` even while the `Status Types` tab shows.
- An id in `?help=` that names no available guide, such as a switched-off feature's, shows the list and leaves the URL as
  typed.
- Switching a feature uses the disposable provider only. Restore it before the next journey, and `$V rows` the change
  both ways.
- The sidebar role label for `calendarConfigure` reads `member`; the guide access check uses the role and the Calendar
  lane, not that label.
