# Public and marketing pages

A visitor reads the product, About, Security, Privacy and Terms pages without an account and reaches Sign In and Request
Access. The pages always show their own light and dark bands, whatever theme the app stored. A signed-in member sees the
same pages with `Dashboard` in place of the access links. The pages are static prose. Every product claim matches what
the app does today, and no page states a price, plan, subscription, trial or quota until Robert approves one.

## Sub-features

- `public-nav`: dark header with the brand link home, `Platform` (`/#platform`), `What's next` (`/#whats-next`),
  `Security`, `FAQ` (`/#faq`) and `About`, then `Sign In` and `Request Access`. The link for the page you are on is
  amber with `aria-current="page"`. There is no classification bar and no theme toggle.
- `narrow-nav`: below 900px the header keeps the brand, `Sign In` and `Request Access`; there is no mobile menu, and the
  footer carries `Platform`, `What's next`, `FAQ`, `About`, `Security`, `Privacy` and `Terms`.
- `public-bands`: public pages render the same light and dark bands whether the stored theme is light or dark.
- `home-hero`: the home page opens on the dark header and a `LESS TIME ON ADMIN. / MORE TIME WITH SOLDIERS.` hero with
  one call to action and the dashboard image below it.
- `home-sections`: Scattered ledger, Duty-day thesis, Available today, Scoped access, What's next, Testimonials and
  Trust and FAQ, in that order, alternating light and dark bands.
- `scoped-access`: four tiers where one is always active, with hover, focus and click choosing a tier and stopping the
  automatic cycle.
- `faq`: six home questions, one answer open at a time, mouse and keyboard.
- `home-anchors`: `Platform`, `What's next` and `FAQ` in the header land on `#platform`, `#whats-next` and `#faq`, each
  section's top just below the sticky header.
- `footer-links`: four links that resolve on desktop, seven below 900px.
- `contact-cards`: `mailto:` links on Security (the `Email Security` button), Privacy and Terms.
- `signed-in-state`: `Dashboard` in the header and `Go to Dashboard` as the closing call to action on every public page.
- `public-claims`: no public page claims a feature, price, plan or quota the product does not have.
- `public-appearance`: Home, About, Security, Privacy and Terms at 1440x900, 1024x768 and 390x844 with the stored theme
  light and dark, no horizontal overflow, no console error.

## How to get to it (user POV)

Open the site root signed out. `Platform`, `What's next`, `Security`, `FAQ` and `About` are in the header with `Sign In`
and `Request Access`; the footer carries `About`, `Security`, `Privacy` and `Terms`. `Request Access` also closes every
page except Security, which closes with `Email Security`. A signed-in member opens the same URLs and sees `Dashboard`
instead.

## Driving it with verify:app

Use the origin from `doctor`. These pages are static, so loading, empty, error and denied states do not apply. The only
access state is signed out versus signed in. Public tabs use `tool new_page` in a fresh context; the signed-in tab comes
from `login viewer`. Reuse [sign in](sign-in.md) for `/auth/login` and the sign-in form itself, and
[identity recovery](identity-recovery-security.md) for the Request Access form.

Public pages scroll inside the public shell (an `overflow:auto` child of a full-height layout), not the window:
`window.scrollTo` does nothing, `documentElement.scrollHeight` equals the viewport, and `fullPage` screenshots show only
one viewport. Find the shell without relying on class names:
`const shell = [...document.querySelectorAll('body *')].find((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)`,
then scroll with `shell.scrollTo(0, y)`. "The shell" below means this element. The catch-all rate limit allows 60
requests per minute per address, counting every page load and client navigation; pace page loads at least 3 seconds
apart, and if a page body is `{"error":"Too many requests"}` wait 60 seconds and reload before recording anything.

Commands below use `PAGE` and `$ORIGIN`. Helpers: `evaluate_script` for read-only reads, `resize_page` for the viewport,
`take_screenshot`, `press_key` for Tab, Enter and Space, `list_console_messages` for errors.

1. **Public header, signed out.** Open `$ORIGIN/about` at 1440x900 (`resize_page`). Expect a dark header with the brand
   link to `/`, then `Platform` `/#platform`, `What's next` `/#whats-next`, `Security` `/security`, `FAQ` `/#faq` and
   `About` `/about`, then `Sign In` and `Request Access`; no `Dashboard`, no `Toggle theme` control and no
   classification bar above the header. Click `Sign In` and expect `/auth/login`; go back, click `Request Access` and
   expect `/auth/request-access`. On `/about` expect only `About` to be amber with `aria-current="page"`; on `/security`
   only `Security`. On `/privacy` and `/terms` expect no header link current. Clicking the brand from any inner page
   returns to `/`.

2. **Public bands ignore the stored theme.** Run `localStorage.setItem('theme','dark')` and reload `/about`, then
   `/security`, `/privacy` and `/terms`. Expect `document.documentElement.dataset.theme` to be `dark`, yet each page's
   light bands to keep the paper background (`getComputedStyle(section).backgroundColor` is `oklch(0.985 0.001 106.423)`
   or its rgb equivalent, about `rgb(250, 250, 249)`) with near-black text, and its dark bands to be near black
   (`rgb(12, 10, 9)` or similar). Set `localStorage.theme` to `light`, reload, and expect the same colors. Open `/` in
   the dark theme and expect the header and footer to look the same as on `/about`. Clear the key afterwards.

3. **Header on scroll.** On `/about` at 1440x900 scroll the shell down 800px and expect the header to stay at the top of
   the viewport (`position: sticky`) with the same dark background and no layout jump.

4. **Narrow header (390x844).** `resize_page` to 390x844 and reload each public page. Expect the header to show the
   brand, `Sign In` and `Request Access` only: `Platform`, `What's next`, `Security`, `FAQ` and `About` are hidden below
   900px and there is no mobile menu. Expect the footer to carry `Platform`, `What's next`, `FAQ`, `About`, `Security`,
   `Privacy` and `Terms` as reachable links (scroll to the bottom and read them). Expect the shell's
   `scrollWidth <= clientWidth` and no element with `getBoundingClientRect().right > innerWidth`, on every public page.
   The document-level `scrollWidth` check is vacuous here because the shell clips horizontal overflow. Expect each
   header control's rect to lie inside `0..innerWidth`. Repeat at 1024x768 and expect the full header on one line with
   no overlap. Record the actual header text and footer link list.

5. **Home hero.** Open `$ORIGIN/` at 1440x900 signed out. Expect, in order: the 80px dark header, then at y 208 the
   amber eyebrow `READINESS · BUILT FOR THE COMPANY`, then the `h1` at y 248 whose first line `LESS TIME ON ADMIN.` is
   muted grey and second line `MORE TIME WITH SOLDIERS.` amber, both 80px Barlow Condensed on a 76px line (the `h1`
   height is 152px). Below it a serif paragraph no wider than 520px, then `SEE IT WORK` (underlined, `href="#platform"`)
   beside a 48px-high `Request Access` button (`/auth/request-access`) whose right edge sits at x 1360. The dashboard
   image is 1280x520 at x 80, y 624 with its top corners rounded and its alt text starting `TroopToTask dashboard`. The
   hero and header share one near-black background with no seam, and the image is the only element below the fold line
   that is not lazy (`loading` is not `lazy`, `fetchpriority="high"`). Reload with no scroll: the two headline lines
   wipe in left to right, the second 200ms after the first, and under `prefers-reduced-motion: reduce` both are visible
   at once with no transition. Disabling JavaScript (or reading the server HTML with `fetch`) still contains both lines.

6. **Scattered ledger.** Scroll the first light band into view. Expect eyebrow `THE ANSWER EXISTS` in amber, the
   two-line heading `SCATTERED ACROSS / EVERY TRACKER.` in near black, and on its right at 1440 a 420px-wide lead
   paragraph. Below it a table with a 2px top rule, the headers `WHERE IT LIVES TODAY`, `WHAT IT HOLDS`,
   `WHAT GOES WRONG` and `IN TROOPTOTASK`, and seven rows, each at least 64px high. Row one is
   `LEAVE_TRACKER_FINAL_v7.xlsx` / `Leave, TDY and appointments` / `#REF! in the totals row` / `CALENDAR`. The first six
   rows end in a filled amber square after their `IN TROOPTOTASK` label; the seventh, `TASKINGS · NEXT`, ends in an
   empty outlined square, because that part is not built yet. Cells in the second column use regular serif weight
   (`font-weight: 400`); the third column and every lead paragraph use light (300); every mono label is 400. After the
   band scrolls into view the squares turn from grey to amber one row at a time. At 1024 and below the column headers
   are visually hidden and each row stacks as source, holds and goes-wrong lines, still with its label.

7. **Duty-day thesis.** Scroll to the first dark band after the ledger. Expect eyebrow `WHY IT MATTERS`, heading
   `HALF A DUTY DAY,` in muted grey over `GIVEN BACK.` in near white, then a figure captioned
   `ONE LEADER'S DUTY DAY, IN THEIR WORDS` with the legend `ADMIN` and `WITH SOLDIERS`. The `BEFORE` bar is half grey
   and half dim amber under the words `half my day on administrative tasks`. The `WITH TROOPTOTASK` bar shows its grey
   admin segment at 8% of the bar width and the rest bright amber under `nearly all my day with the Soldiers`; read the
   grey segment's width a few seconds after it enters view. Before it enters view (with motion allowed) it is 50%, and
   with `prefers-reduced-motion: reduce` it is 8% at once. The axis reads `0600`, `1200`, `1800`. Beside the chart a
   block with a 2px amber left rule reads `Every hour a leader is not reconciling trackers...` and
   `WORDS · SFC, 1-43 ADA`; below 1280 the quote stacks under the chart.

8. **Available today.** Click header `Platform` (or scroll). Expect `AVAILABLE TODAY` eyebrow, heading
   `ONE FORMATION. / ONE SOURCE OF TRUTH.`, then six product screenshots captioned `01 · CALENDAR`, `02 · PERSONNEL`,
   `03 · TRAINING REPORTS`, `04 · TRAINING`, `05 · EVALS` and `06 · ONBOARDING`, each with a bold condensed heading and
   a serif paragraph. Layout at 1440: shot 01 full width, shots 02 and 03 side by side, shots 04 to 06 in three columns;
   below 768 every shot stacks to one column. Every `img` has a non-empty `alt`, a `width` and `height` attribute, and
   `loading="lazy"`, and none is wider than its column. The section element has `id="platform"`.

9. **Scoped access.** Scroll to the second dark band. Expect eyebrow `SCOPED ACCESS · BUILT IN` and heading
   `EVERY LEADER / OWNS THEIR PIECE.`, both heading lines near white. A `group` named `Access tiers` holds four buttons:
   `COMMANDER · 1SG` (`81`), `PLATOON SERGEANT` (`27`), `SQUAD LEADER` (`9`) and `TEAM LEADER` (`4`), each with
   `aria-pressed`. On load exactly one is pressed, `SQUAD LEADER`, with an amber left rule, and the line under the grid
   reads `SSG REYES · 2ND PLT, 1ST SQD` and `SEES 9 · UPDATES 9`. The grid shows three labelled platoons of 27 cells;
   the number of amber cells always equals the pressed tier's count. Hover `PLATOON SERGEANT`, then Tab to
   `TEAM LEADER`, then click `COMMANDER · 1SG`: after each, only that button is pressed, the `SEES n · UPDATES n` line
   shows its count and the amber cell count matches. After any of those the automatic cycle stays stopped for the rest
   of the visit: wait 6 seconds and expect no change. On a fresh load with motion allowed and the band in view, poll
   `aria-pressed` and expect the pressed tier to advance by one about every 2.4 seconds, wrapping from `TEAM LEADER` to
   `COMMANDER · 1SG`; scroll it out of view and the cycle pauses. With `prefers-reduced-motion: reduce` it never
   advances. `emulate` cannot set that media feature, so pass `navigate_page` an `initScript` that replaces
   `window.matchMedia` with an object whose `matches` is true for `(prefers-reduced-motion: reduce)`. Below 1280 the
   tiers sit above the grid.

10. **What's next.** Click header `What's next`. Expect `WHAT'S NEXT · IN DESIGN NOW`, heading
    `ADMIN UPDATES. / DONE IN SECONDS.` and the lead saying these are not yet in the product. A bordered card holds
    `DROP ZONE · AI`, `JUST SAY IT.` and a transcript that types in word by word, then three change cards
    (`CALENDAR · ADD STATUS`, `TRAINING · LOG COMPLETION`, `TASKINGS · ASSIGN PERSON`) whose `REVIEW` tags change to
    updated, ending with `DISCARD` and `APPROVE 3 CHANGES`; none of these is a working control. Under it the
    `EVENTS & TASKINGS · IN DESIGN` block lists `STAFFED 3 / 4 medics`, `EQUIPPED 3 of 4 ready` in red and
    `ON TIME Starts Mon 19 Oct` beside an image. Last the `AI ACROSS THE PLATFORM · IN DESIGN` row shows four verbs
    `ASK`, `BRIEF`, `FORECAST` and `FILL` in amber, each with a quoted prompt and a result line. Every verb is on one
    line at 1440, and the verbs form two columns below 1280. The section element has `id="whats-next"`. Nothing in this
    section claims the product does these things today.

11. **Testimonials.** Scroll to the third dark band. Expect `FROM LEADERS USING IT TODAY` with
    `JBER, ALASKA · GRAFENWÖHR, GERMANY · FORT BLISS, TEXAS` on the right, the large two-tone quote ending in
    `DISAPPEARED OVERNIGHT.` in amber with `COMPANY LEADERSHIP · 18TH CSSB`, and under a rule two smaller quotes
    attributed `CPT · FORMER COMPANY COMMANDER · MEDDAC-AK` and `SFC · 1-43 ADA`, in two columns at 768 and above.

12. **Trust and FAQ.** Click header `FAQ`. Expect `BEFORE YOU HAND OVER THE ROSTER` and `FAIR / QUESTIONS.` beside five
    control rows (`NIST 800-171`, `AES-256`, `TLS 1.2+`, `ROLES`, `AUDIT`), then the line ending
    `Not authorized for classified information.` Expect six question buttons, each with a `+` that becomes `−` when
    open. On load question 3 (`I already have my roster in a spreadsheet...`) is open (`aria-expanded="true"`, answer
    visible) and the other five are `false` with answers not visible. Click question 1: it opens and question 3 closes,
    so never more than one is open. Click the open question: it closes and none is open. Tab to a question and press
    Enter, then Space on another: each toggles as with a click. Expect a visible focus ring on the focused trigger:
    computed `outlineStyle` not `none` with `outlineWidth` above 0, or a non-`none` `boxShadow` ring.

13. **Header anchors.** From the top of `/` at 1440x900 click `Platform`, then `What's next`, then `FAQ`. After each,
    expect the URL hash to be `#platform`, `#whats-next`, `#faq`, the shell scrolled so that section's top edge is
    within 2px of 80px (the sticky header's height) and its eyebrow visible. Click `SEE IT WORK` and expect `#platform`.
    From `/about`, click `FAQ` and expect `/` with `#faq` and the FAQ in view. At 390 the same links in the footer do
    the same, with the footer link list from step 14.

14. **Footer links.** At 1440 scroll to the footer and list the visible links in `nav[aria-label="Footer"]` with
    `evaluate_script` (a bare `footer` selector also matches the Thesis quote's footer). Expect exactly four: `About`
    `/about`, `Security` `/security`, `Privacy` `/privacy`, `Terms` `/terms`, beside the brand and
    `Not for classified information`. At 390 expect those four plus `Platform` `/#platform`, `What's next`
    `/#whats-next` and `FAQ` `/#faq`. On `/about` and `/security` the matching footer link is amber with
    `aria-current="page"`. A same-origin `fetch` of each path returns 200. Click `Privacy` and `Terms` and expect their
    headings.

15. **Contact cards.** Read every `a[href^="mailto:"]` on `/security`, `/privacy` and `/terms`. Expect Security to have
    `mailto:security@trooptotask.org?subject=Security%20vulnerability%20report` on its `Email Security` button in the
    closing band, Privacy to have a card for `privacy@trooptotask.org`, and Terms to have a card for
    `support@trooptotask.org`. Inline `privacy@trooptotask.org` links in Privacy and Terms body text are also `mailto:`.
    Do not click; record the hrefs.

16. **Keyboard.** On `/about` at 1440 press Tab from the top and, after each press, read `document.activeElement` (tag,
    text or aria-label, href) and its computed outline and box shadow. Expect: brand, `Platform`, `What's next`,
    `Security`, `FAQ`, `About`, `Sign In`, `Request Access` in visible left-to-right order, each with a visible focus
    ring. Repeat at 390x844 and expect the order brand, `Sign In`, `Request Access`. Repeat on `/security` for the
    header part.

17. **Signed-in state.** `login viewer`, then `navigate_page` the signed-in page to `$ORIGIN/`. Expect the header to
    show `Dashboard` (to `/dashboard?show=all`) and not `Sign In` or `Request Access`, and the hero and closing call to
    action to read `Go to Dashboard` and not `Request Access`. Repeat on `/about`, `/privacy` and `/terms` (header and
    closing call to action), and on `/security` (header only; its closing band is `Email Security` in both states);
    expect no `Request Access` or `Sign In` link anywhere. The footer is the same in both states. Click `Dashboard` and
    expect `/dashboard?show=all`, the signed-in Organization chooser, not a login form. Screenshot signed-in `/about`
    at 1440.

18. **Claims scan.** For each of the five pages, run `evaluate_script` with `() => document.body.innerText` and save the
    text to `<page>-text.txt` in the run directory. Search it case-insensitively for
    `pricing|price|plans|subscri|billing|trial|free tier|seat|checkout|invoice|per month|duty roster|duty assign|rotation|tier`
    and `\$\d`. Read each match in context. Expect no price, plan, subscription, trial or quota claim, and no feature
    claim the app does not deliver. "The plan" as everyday English is not a claim, and the shipped duty roster is a real
    feature.

19. **Appearance matrix.** For each width (1440x900, 1024x768, 390x844) and stored theme (light, dark) and each page
    (home, about, security, privacy, terms): `resize_page`, set `localStorage.theme`, `navigate_page`, reveal the page,
    then capture it as described below into `<page>-<width>-<theme>.png`. That is 30 captures; the two themes must look
    identical on About, Security, Privacy and Terms. **Reveal.** Home arms each block below the fold as
    `data-reveal="pending"` and shows it once an IntersectionObserver sees it, so a capture before scrolling shows those
    blocks in their starting state. Immediately before the capture run `evaluate_script` with an async function that
    steps the shell's `scrollTo(0, y)` down its `scrollHeight` in increments of `innerHeight / 2`, waits 150 ms per step
    and 600 ms at the bottom, scrolls back to 0, waits 600 ms and returns
    `document.querySelectorAll('[data-reveal="pending"]').length`. Expect 0 before capturing; the same helper runs
    harmlessly on the other pages. **Full-page capture.** A tall viewport changes the layout (the shell fills the
    viewport height), so stitch instead: take a viewport screenshot at scroll 0, then repeatedly scroll the shell to
    `previousBottom - 56` (clamped to the end), wait 700 ms, take a viewport screenshot, drop its top
    `previousBottom - actualScrollTop` rows (the sticky header and the overlap), and append. The stitched height equals
    the shell's `scrollHeight`; a 1 px seam line can appear. Review each capture for clipping, overlapping text and
    legibility of text over its background in both themes.

20. **Console.** After each page load in the matrix, call `list_console_messages` and save it. Expect no `error`
    message. The owned app is not hosted on Vercel, so every page also logs one or two errors for
    `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` (HTML MIME type or 404) and matching Vercel
    `log` lines. Record these as environment noise and list them separately; any other error is a failure.

21. **Contrast.** On each page, with the stored theme light and dark at 1440, run `evaluate_script` over visible text
    nodes: resolve the text color and the nearest opaque ancestor background (use a 1x1 canvas to convert `oklch()`
    colors), and list text under 4.5:1 (3:1 for 24px or 18.66px bold), skipping text inside `aria-hidden="true"`
    decoration. Expect none. Small amber labels on the light bands use the darker `accent-text` amber, not the bright
    accent.

## Gotchas

- The stored theme lives in `localStorage` under `theme` and is applied to `html[data-theme]`, but public pages ignore
  it: the shell sets `data-theme="light"` on its own wrapper, so light bands keep the light tokens and dark bands use
  the fixed chrome tokens. There is no public theme toggle; set the key with `evaluate_script` and reload.
- Home sections that reveal on scroll depend on IntersectionObserver; a screenshot before scrolling can show them in
  their starting state.
- Public pages never fetch Organization data; a signed-in tab only changes the header and call-to-action state. A
  session that has not finished MFA is treated as signed out.
