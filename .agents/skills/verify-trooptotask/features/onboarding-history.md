# Onboarding History

A leader reviews finished Onboarding packets: who finished or stopped, how long it took against the typical time, how far a cancelled packet got, the final packet and the notes with who wrote them. History is read only. It keeps the member's Organization and Group scope and the Organization's retention period.

## Sub-features

- `header`: title `History` and a subtitle of up to three parts: `N finished in the last 90 days`, `Typically N days to finish` and `N cancelled`. A part with nothing to say is absent, and the typical figure is absent below three recent completed packets. The counts cover packets finished in the last 90 days whatever the filters.
- `toolbar`: `Onboarding history controls` hold the outcome view (`All`, `Completed`, `Cancelled`), search by name, rank or MOS, the `Group` and `Template` selects and the `Active onboarding` link. There is no primary action. `Group` is absent when the Organization has no Groups.
- `table`: `Finished packets`, the count of rows that match, and `most recent first`. Columns are Soldier (with Group and MOS), Template, Dates, Took, Final and Outcome. Rows sort by finish date, newest first. A completed packet finishes on its completion date and a cancelled one on the UTC date of its cancellation.
- `amber`: `Took` is amber when the packet took well past the typical time, and `Final` is amber for a cancelled packet, which shows how far it got.
- `expanded-row`: one row opens at a time. The heading `Final packet · read only` lists every step (a check for done, an open circle for open, the paperwork stage it ended on, removed steps last as `Removed from template` or `Previously completed`). `Notes · N` lists every note on the packet, oldest first, as the text then `step · author · date`. Nothing in an open row can be changed.
- `note-authors`: the author is the member's display name or email from Organization membership, `You` for the signed-in member, `Member` for a membership with no email or name (the seeded `onboardingConfigure`, `onboardingOperate` and `onboardingView` memberships carry no email) and `Former member` when no membership row is readable. A bare user id never appears. The Active packet panel shows the same names.
- `retention`: `Kept N months after finishing, then deleted. Set in Organization settings.` N is the Organization's retention setting. `Organization settings` is a link to Settings → Policies only for a member who can open Organization settings.
- `states`: `No finished packets yet` (nothing finished), `No packets match` with `Clear filters` (filters hide everything), the Organization error page for a failed load (`500`, `Try again`), `403` for a member without Onboarding. History is a blocking load: the previous page stays until the data arrives, so there is no skeleton.

## How to get to it (user POV)

Choose `Onboard` in Organization navigation, then `History`, or open `/onboarding/history` with `$V actor onboardingConfigure onboarding/history`. `Active onboarding` returns to the list. Below 1280 the table stacks each row as a card with labelled cells (Template, Dates, Took, Final, Outcome) and the toolbar folds into `More`.

## Verification recipe

Preconditions: `doctor` passes for this checkout and worker. `$V seed onboarding-history-view` creates, in Organization A, a second template and six Persons with packets finished relative to today: Alpha completed in 9 days, Alpha completed in 11 days on the second template, Bravo completed in 13 days, Bravo completed in 46 days on the second template (took long), Alpha cancelled after 8 days, and Bravo completed 120 days ago (outside the 90-day window). Three notes by `onboardingConfigure`, the `orgAdmin` member and a user id that is not a member sit on each step of the first packet and on the cancelled packet's first step. The fixture's March packet for Able is also listed, outside the window. Read `$V rows organizations orgA` for `archive_retention_months`. `clean-seeds` removes the cohort, template included.

1. **Header and table.** As `onboardingConfigure` at 1280 light, then 390 dark. The subtitle reads `5 finished in the last 90 days · Typically 12 days to finish · 1 cancelled` (the median of 9, 11, 13 and 46 is 12). Seven rows, newest finish first. The 46-day row has amber `Took` and the cancelled row has amber `Final`.
2. **Filters.** `Cancelled` leaves the one cancelled row; `All` restores it. Search `68w` keeps Persons with that MOS. `Group` Alpha and `Template` the second template each narrow the rows. A combination with no match shows `No packets match`; `Clear filters` restores every row and the toolbar.
3. **Expanded row.** Open the first completed Alpha packet. `Final packet · read only` lists its steps, `Notes · 9` lists each note with step, author and date: `You` for the signed-in member, the `orgAdmin` email, `Former member` for the non-member. Repeat as `orgAdmin`: the `onboardingConfigure` notes read `Member`. Open another row and the first closes. Reload and reopen with Enter and Space.
4. **Active panel.** Open an active packet on `Onboard` whose step carries a note by the signed-in member and one by another member. The panel names both as in History.
5. **Retention.** The line carries the setting read in step 0 (36 months by default). Change it with Settings → Policies as `orgOwner`, reload History and read the new figure. `Organization settings` is a link for `orgAdmin` and plain text for `onboardingConfigure`.
6. **Scope.** `onboardingScoped` sees only Alpha rows and the counts in the header follow. `onboardingEmpty` sees `No finished packets yet`. `calendarView` receives `403`. `onboardingView` can read but nothing changes.
7. **States.** `$V server-source arm personnel_onboardings fail-hard 1`, full reload of `/onboarding/history` gives the error page; restore. `server-source arm personnel_onboardings hold 1 20000`, then open History from the list: the list stays until the load completes. Release and restore.

Evidence per drive: before and after snapshot and screenshots at 1280 and 390 in light and dark. Expected results come from the #1665 spec; the cohort rows are privileged setup, not UI creation.
