# App shell and saved preferences

A member reaches authorized screens while optional header content loads separately, and their Calendar and Training choices persist for their own user and Organization without resetting a newer selection.

## Sub-features

- `first-paint`: authorized navigation and the current screen are usable before optional notification-count and Organization-switcher replies settle.
- `optional-chrome`: a failed optional read leaves the screen, Account menu and permitted navigation usable; a fresh load recovers.
- `training-preferences`: Group, saved View and matrix mode filter loaded data immediately; preference-only saves cause no Training workspace request or loading reset.
- `pending-preferences`: edits within the debounce window and while an earlier save is held preserve the latest Group/View after settlement, navigation and full reload.
- `save-failure`: failed persistence remains visible; retry does not lose an unrelated pending field or silently claim persistence.
- `calendar-preferences`: Display options save and reload independently of Training preferences.
- `scope-lifetime`: A/B and different users retain separate choices; late A replies or feedback cannot replace B state or a new signed-in user's state.
- `admission`: a nonmember cannot read shell data or save another Organization's preferences; the server derives the actor rather than trusting body IDs.

## How to get to it (user POV)

Sign in normally and choose Training or Calendar in the app navigation. Training has Group, saved View and matrix-view controls. Calendar's More Calendar actions menu contains Show Status Text and Show Personnel Roles. The persisted Onboarding highlighting field currently has no visible toggle. Use the header's Switch organization and Account menus for scope/session changes.

Getting Started currently has a retained API and model, but no visible checklist or dismiss control. Its GET/POST/DELETE behavior belongs in separately labeled authenticated HTTP/provider proof. Do not invent a browser journey for that endpoint or count Calendar's write-only visited localStorage key as a visible checklist.

## Driving it with verify:app

Preconditions: launch and doctor pass on the owned worker. Use `$V actor trainingSwitch training` for A/B Training, `trainingOperate` for an independent A user, `trainingForeign` for B-only denial, and `$V actor calendarSwitch calendar` for Calendar. `$V fixture` supplies exact Group/View and Organization IDs. Keep native snapshots, screenshots, preference PATCH/request observations and `$V preferences ROLE orgA|orgB` reads together. Privileged readback is distinct from ordinary UI or authorization proof.

1. Record a fresh Training snapshot and initial `$V preferences trainingSwitch orgA` and `orgB`. Use `$V network arm-observe PAGE user-preferences`; choose Focus View and Alpha from fresh native snapshots. The filtered matrix must update immediately. Save network state and native `list_network_requests` before/after; require successful PATCH, no subsequent Training `__data.json` workspace navigation caused solely by that save, and no loading reset. Reload and compare visible choices and exact saved IDs. Restore the control.
2. Arm `$V network arm-hold PAGE user-preferences`, change only View, and require state to report the real PATCH `200` held after dispatch. While it remains held, change Group and matrix mode. Capture the immediate latest visible choices and saved first-patch rows. Release, record subsequent PATCHes and requests, then capture after settlement, navigation away/back and full reload. Latest choices must survive all three. Repeat with both fields changed within one debounce interval using ordinary visible controls; distinguish this from edits made after the first PATCH was dispatched. Never call context setters directly.
3. Arm `arm-fail` on `user-preferences`, change a filter, and capture error feedback plus unchanged saved values. Restore and explicitly choose the desired filter again; require saved rows and reload to agree. A synthetic 503 is client recovery proof, not a real database outage. `arm-hold-fail` holds a failure before provider dispatch and permits Organization/session lifetime checks. It must leave persistence unchanged.
4. With a real A PATCH held, switch to B through the visible switcher. Record B's route, filters and exact A/B rows before release. Release A, then require B state and feedback to remain scoped to B. Return to A and reload to inspect the actual A saved choices. Repeat pending failure with `arm-hold-fail` and sign out via Account → Sign Out; require the public landing page without app navigation or stale save feedback. This ordinary POST/logout performs full-document navigation and destroys the control; a false `release` afterward does not establish a delivered late-session response. Retain that same-document lifetime case as lower-level or unavailable proof. A fresh login as another synthetic user must start from that user's rows. Use one browser context for actual sign-out, and label separate-context user reads accurately.
5. Use `dashboardSwitch`, which has both Training and Calendar lanes in A/B. Establish nondefault Training choices visibly before following Calendar. Record original Display values and those Training sentinel preferences. Toggle a Display preference with `user-preferences` observation, inspect saved rows and reload. Training fields must be unchanged. Switch A→B→A and confirm each Organization's own Display values. Restore the original Training and Calendar values through the UI and verify readback. `calendarSwitch` can separately exercise Calendar but has no Training lane/sentinel.
6. `$V network arm-hold PAGE shell-notification-count` installs before reload. Require the recorded GET/real status to be held while the Training screen, permitted navigation and Account menu remain usable. Release and capture settlement. Repeat `arm-fail` for notification count and `shell-organization-switcher`; explicitly open Switch organization to dispatch the lazy switcher GET. The other chrome part and page must remain usable, then recover on an ordinary fresh reload after restore. These controls isolate exact A GET parts; they do not prove provider-source failure or first-paint server timing.
7. As `trainingForeign`, use read-only authenticated fetch on the signed-in owned page to request A shell chrome, and separately submit an ordinary A preference PATCH with an explicit harmless filter. Require denied 403/404 and unchanged A/B user rows. Keep direct HTTP actions distinct from native interaction. Current Getting Started GET/POST/DELETE similarly needs own-user persistence, foreign-Organization denial and cross-user sentinels; restore dismissal through DELETE when it was originally absent.

Restore every control before reload/cleanup. Restore original preferences with native controls, verify exact rows, finish doctor and owned cleanup, then package sanitized artifacts under the task's evidence contract.

## Gotchas

- #1420's preference-triggered Training reload is a known failing baseline that D26 must repair. A verification-only PR may expose it; it must not redefine that reload as intended behavior or claim D26 complete.
- Shell controls automatically reload to install before the deferred requests start; preference controls install on the already-open page. `arm-hold` dispatches the real request before delaying its response; `arm-hold-fail` dispatches nothing. Record which boundary was exercised.
- A control destroyed by full navigation is not a released late response. Keep state/release receipts and distinguish native interaction, provider reads, source mapping and lower-level tests.
- Saved/deleted Group or View IDs need selection validation, but never reintroduce a deleted catalog merely to satisfy a preference. Record unavailable stale-choice proof explicitly until the owned fixture can exercise it.
- First-paint/deferred orchestration, stale responses, concurrent requests and SSR isolation also have lower-level shell/Header tests. Inspect their actual behavior; screenshots alone cannot prove server timing or request-local state.
