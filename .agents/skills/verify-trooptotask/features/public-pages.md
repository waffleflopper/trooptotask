# Public and marketing pages

A visitor reads the product, About, Security, Privacy and Terms pages without an account and reaches Sign In and
Request Access. The pages always show their own light and dark bands, whatever theme the app stored. A signed-in member
sees the same pages with `Dashboard` in place of the access links. The pages are static prose. Every product claim matches what the app does today, and no page states a price,
plan, subscription, trial or quota until Robert approves one.

## Sub-features

- `public-nav`: dark header with the brand link home, `Platform` (`/#platform`), `What's next` (`/#whats-next`),
  `Security`, `FAQ` (`/#faq`) and `About`, then `Sign In` and `Request Access`. The link for the page you are on is
  amber with `aria-current="page"`. There is no classification bar and no theme toggle.
- `narrow-nav`: below 900px the header keeps the brand, `Sign In` and `Request Access`; there is no mobile menu, and the
  footer carries `Platform`, `What's next`, `FAQ`, `About`, `Security`, `Privacy` and `Terms`.
- `public-bands`: public pages render the same light and dark bands whether the stored theme is light or dark.
- `faq`: six home questions, one answer open at a time, mouse and keyboard.
- `footer-links`: four links that resolve on desktop, seven below 900px.
- `contact-cards`: `mailto:` links on Security (the `Email Security` button), Privacy and Terms.
- `signed-in-state`: `Dashboard` in the header and `Go to Dashboard` as the closing call to action on every public page.
- `public-claims`: no public page claims a feature, price, plan or quota the product does not have.
- `public-appearance`: Home, About, Security, Privacy and Terms at 1440x900, 1024x768 and 390x844 with the stored theme
  light and dark, no horizontal overflow, no console error.

## How to get to it (user POV)

Open the site root signed out. `Platform`, `What's next`, `Security`, `FAQ` and `About` are in the header with
`Sign In` and `Request Access`; the footer carries `About`, `Security`, `Privacy` and `Terms`. `Request Access` also
closes every page except Security, which closes with `Email Security`. A signed-in member opens the same URLs and sees
`Dashboard` instead.

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
   `About` `/about`, then `Sign In` and `Request Access`; no `Dashboard`, no `Toggle theme` control and no classification
   bar above the header. Click `Sign In` and expect `/auth/login`; go back, click `Request Access` and expect
   `/auth/request-access`. On `/about` expect only `About` to be amber with `aria-current="page"`; on `/security` only
   `Security`. On `/privacy` and `/terms` expect no header link current. Clicking the brand from any inner page returns
   to `/`.

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

5. **FAQ.** On `/` use the header `FAQ` link and expect the FAQ section in view with `#faq` in the URL. Expect six
   question buttons, all `aria-expanded="false"` with their answers not visible (hidden or not rendered). Click question
   1: it becomes `aria-expanded="true"` and its answer is visible. Click question 2: question 2 opens and question 1
   closes, so never more than one is open. Click the open question: it closes and none is open. Tab to a question and
   press Enter, then Space on another: each toggles as with a click. Expect a visible focus ring on the focused trigger:
   computed `outlineStyle` not `none` with `outlineWidth` above 0, or a non-`none` `boxShadow` ring.

6. **Footer links.** At 1440 scroll to the footer and list its visible links with `evaluate_script`. Expect exactly four:
   `About` `/about`, `Security` `/security`, `Privacy` `/privacy`, `Terms` `/terms`, beside the brand and
   `Not for classified information`. At 390 expect those four plus `Platform` `/#platform`, `What's next`
   `/#whats-next` and `FAQ` `/#faq`. On `/about` and `/security` the matching footer link is amber with
   `aria-current="page"`. A same-origin `fetch` of each path returns 200. Click `Privacy` and `Terms` and expect their
   headings.

7. **Contact cards.** Read every `a[href^="mailto:"]` on `/security`, `/privacy` and `/terms`. Expect Security to have
   `mailto:security@trooptotask.org?subject=Security%20vulnerability%20report` on its `Email Security` button in the
   closing band, Privacy to have a card for `privacy@trooptotask.org`, and Terms to have a card for
   `support@trooptotask.org`. Inline `privacy@trooptotask.org` links in Privacy and Terms body text are also `mailto:`.
   Do not click; record the hrefs.

8. **Keyboard.** On `/about` at 1440 press Tab from the top and, after each press, read `document.activeElement` (tag,
   text or aria-label, href) and its computed outline and box shadow. Expect: brand, `Platform`, `What's next`,
   `Security`, `FAQ`, `About`, `Sign In`, `Request Access` in visible left-to-right order, each with a visible focus
   ring. Repeat at 390x844 and expect the order brand, `Sign In`, `Request Access`. Repeat on `/security` for the header
   part.

9. **Signed-in state.** `login viewer`, then `navigate_page` the signed-in page to `$ORIGIN/`. Expect the header to show
   `Dashboard` (to `/dashboard?show=all`) and not `Sign In` or `Request Access`, and the hero and closing call to action
   to read `Go to Dashboard` and not `Request Access`. Repeat on `/about`, `/privacy` and `/terms` (header and closing
   call to action), and on `/security` (header only; its closing band is `Email Security` in both states); expect no
   `Request Access` or `Sign In` link anywhere. The footer is the same in both states. Click `Dashboard` and expect
   `/dashboard?show=all`, the signed-in Organization chooser, not a login form. Screenshot signed-in `/about` at 1440.

10. **Claims scan.** For each of the five pages, run `evaluate_script` with `() => document.body.innerText` and save the
    text to `<page>-text.txt` in the run directory. Search it case-insensitively for
    `pricing|price|plans|subscri|billing|trial|free tier|seat|checkout|invoice|per month|duty roster|duty assign|rotation|tier`
    and `\$\d`. Read each match in context. Expect no price, plan, subscription, trial or quota claim, and no feature
    claim the app does not deliver. "The plan" as everyday English is not a claim, and the shipped duty roster is a real
    feature.

11. **Appearance matrix.** For each width (1440x900, 1024x768, 390x844) and stored theme (light, dark) and each page (home, about,
    security, privacy, terms): `resize_page`, set `localStorage.theme`, `navigate_page`, reveal the page, then
    capture it as described below into `<page>-<width>-<theme>.png`. That is 30 captures; the two themes must look
    identical on About, Security, Privacy and Terms. **Reveal.** Home hides each
    `.reveal` section until an IntersectionObserver sees it, so a capture of an unrevealed page is blank in places.
    Immediately before the capture run `evaluate_script` with an async function that steps the shell's `scrollTo(0, y)`
    down its `scrollHeight` in increments of `innerHeight / 2`, waits 150 ms per step and 600 ms at the bottom, scrolls
    back to 0, waits 600 ms and returns `document.querySelectorAll('.reveal:not(.revealed)').length`. Expect 0 before
    capturing; the same helper runs harmlessly on the other pages. **Full-page capture.** A tall viewport changes the
    layout (the page spaces sections in `vh` units), so stitch instead: take a viewport screenshot at scroll 0, then
    repeatedly scroll the shell to `previousBottom - 56` (clamped to the end), wait 700 ms, take a viewport screenshot,
    drop its top `previousBottom - actualScrollTop` rows (the sticky header and the overlap), and append. The stitched
    height equals the shell's `scrollHeight`; a 1 px seam line can appear. Review each capture for clipping, overlapping text and legibility of text over its
    background in both themes.

12. **Console.** After each page load in the matrix, call `list_console_messages` and save it. Expect no `error`
    message. The owned app is not hosted on Vercel, so every page also logs one or two errors for
    `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` (HTML MIME type or 404) and matching Vercel
    `log` lines. Record these as environment noise and list them separately; any other error is a failure.

13. **Contrast.** On each page, with the stored theme light and dark at 1440, run `evaluate_script` over visible text
    nodes: resolve the text color and the nearest opaque ancestor background (use a 1x1 canvas to convert `oklch()`
    colors), and list text under 4.5:1 (3:1 for 24px or 18.66px bold), skipping text inside `aria-hidden="true"`
    decoration. Expect none. Small amber labels on the light bands use the darker `accent-text` amber, not the bright
    accent.

## Gotchas

- The stored theme lives in `localStorage` under `theme` and is applied to `html[data-theme]`, but public pages ignore
  it: the shell sets `data-theme="light"` on its own wrapper, so light bands keep the light tokens and dark bands use the
  fixed chrome tokens. There is no public theme toggle; set the key with `evaluate_script` and reload.
- Home sections that reveal on scroll depend on IntersectionObserver; a screenshot before scrolling can show them in
  their starting state.
- Public pages never fetch Organization data; a signed-in tab only changes the header and call-to-action state. A
  session that has not finished MFA is treated as signed out.
