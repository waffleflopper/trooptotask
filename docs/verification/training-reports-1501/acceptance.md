# Training Reports slice 1 acceptance

Issue [1501](https://github.com/waffleflopper/trooptotask/issues/1501) implements the readiness foundation for [1433](https://github.com/waffleflopper/trooptotask/issues/1433). This record covers the first slice. Forecast, grid, focus areas, drill-down and redesigned report exports remain for later slices on the same branch and PR.

Training Reports now count current, yellow and orange records as ready. Expired and missing records are not ready; exempt, not-required and optional requirements stay outside the denominator. The current report layout and status labels remain. The non-compliance API list now counts expired/missing requirements consistently with that readiness rule.

Organizations gain a whole-number Training readiness goal from 1 to 100, default 90. Settings → Policies saves it independently under the existing `organization.updateSettings` policy. Both client and server reject invalid values. The database enforces smallint, NOT NULL, default and range. Current reports do not consume the goal yet. Dashboard Training currency, Personnel readiness warnings and the Critical Tasks threshold of 70 retain their existing paths.

## Candidate and ownership

Base and tested revision `4d1f1dec6f96b6892245522fa3dfefd5cf4c7fae`, plus the implementation diff. Final native candidate `b1f29a4ec4f8769735c3642790fcb529007d95bb85c24fa21ce67fef32c74136`. Baseline revision `3a1cd50880356eb9b9c1c7bca570938b563fcee6` and candidate `09a4e3c3379dfc20d42bfdbfc1463c4005b645ff8166e6e165958f35469a3135`. Main was integrated by fast-forward; the additive database-list conflict kept both upstream and goal entries.

One T3 implementation child used Claude Opus 5.5, medium, with focused context and exclusive source ownership. It read the relevant Paper nodes and implemented the existing-style goal card. It had no database, service, browser or publication authority. A separate Claude Opus 5.5 medium T3 child reviewed visual artifacts. The parent owned integration, actual browser actions, isolated database runs and final acceptance.

A bounded, read-only Codex reviewer used the parent model and effort. It reviewed the complete source diff and actual expanded artifacts; this is independent review, not model diversity or independent live execution. All visual decisions and review used the requested Claude delegation. No concurrent writers or shared browser drivers.

The accepted browser drive finished before evidence packaging. Later architecture wording and this record are prose changes. Archives were added after final doctor and cleanup; no new live run is claimed for packaging. The validation archive retains the source patch and exact runtime overrides.

## Observed behavior

| Boundary                   | Accepted observation                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                   | Same dated fixture yielded 25% readiness, Alpha 50%, Targeted 0%, Required 33%.                                                                                                                      |
| Final report               | Native import and reload yielded 50% readiness, Alpha 100%, Targeted 100%, Required 33%. One current, one orange, one expired and one missing requirement independently give 2 ready / 4 applicable. |
| Report filter and workbook | Native Alpha filter yielded 100%. Actual downloaded workbook retains three A rows, saved dates and distinct Current/Expiring/Expired/Not Done labels.                                                |
| Policies                   | Native default 90, owner save 85 and reload, admin save 86 and reload. Neighboring policies stay unchanged. Goal restored to 90.                                                                     |
| Validation and recovery    | Blank, 0, 101 and 90.5 expose a linked field error and disable Save. A synthetic pre-provider 503 preserves the 80 draft and saved 85. Enter on focused Save retries successfully.                   |
| Access                     | Native member Policies page denies access. Separate ordinary API member write returns 403, foreign target 404, malformed values 400. A/B readbacks remain exact.                                     |
| Raw export consumer        | Native JSON and Excel downloads contain all twelve Organization-profile fields including numeric goal 90. Actual profile values match stored readback.                                               |
| Database                   | Fresh replay and populated upgrade pass. The new 19-assertion contract checks default, type, NOT NULL, bounds, original values and owner/admin/member/foreign access.                                |
| Restoration                | Native Delete confirmations remove only the two imported records, reload restores initial cells, goal returns to 90, all hooks restore, final doctor and owned cleanup pass.                         |

The browser used an owned production app at `http://127.0.0.1:44825`, worker 1, synthetic A/B Organizations and isolated role contexts. Runtime versions were Node 24.21.0, npm 11.19.0, Chromium 152.0.7977.82, Supabase CLI 2.101.0 and Postgres 17.6.

Lower-level behavioral tests separately cover both warning colors, applicability exclusions, strict server validation, provider acknowledgment, edits during a pending save and disposed Organization targets. Those timing cases were not additional independent browser executions. Visual acceptance covers desktop light screenshots and accessibility snapshots; dark/narrow layouts and spinner appearance were not captured.

## Verification and review

`npm run format`, final `npm run gate` and final `npm run build` pass. Gate covers format checking, lint, governance, Svelte/type checking and tests. All 660 test files / 6,384 tests pass; type checking reports zero errors and warnings. Verification helper tests and 14 CI lifecycle/safety tests pass. Touched Markdown formatting, local links and whitespace checks pass.

Material warnings are retained in logs. There are three existing Map/Set lint warnings, 418 reported historical governance findings with the regression gate passing, a build chunk-size warning and an optional `@opentelemetry/api` resolution warning. No guard, scan, budget or test was weakened.

The isolated database runner passes against two seed-disabled disposable stacks. Fresh replay applies 167 migrations. Populated replay starts from the audited 141-migration predecessor and applies the remaining 26 after preserving synthetic historical witnesses. Project IDs, allocated unused ports, exact commands, effective SQL and cleanup are in `database-accepted.log`.

Earlier upgrade comparisons failed because old JSON snapshots did not include the new column. Thirteen narrow projections exclude only that added field; the new goal contract protects it separately. A later attempt hit Docker temporary-mount inode exhaustion. The parent removed 5,000 old regenerable Node compile-cache files and repeated complete fresh/upgrade checks successfully. Failed logs remain explicitly superseded. No existing local or remote database was reset or changed.

Independent source review found no correctness, security or performance defects. Three prose findings were fixed, including deferred goal consumption and the twelve-field export inventory. The no-comments pass removed three new SQL narration comments. Deslop was unavailable; the parent checked dead paths, unnecessary abstractions, casts, suppressions, stale consumers and unrelated edits directly. Claude's visual verdict is clean. Its freshness flag triggered final gate/build repetition.

Independent expanded-artifact acceptance is clean. The reviewer re-hashed all payloads, matched all 51 source/SQL patch blocks to the checkout, parsed both actual workbooks and verified the literal report, saved-value, denial and restoration outcomes. Two receipt nits were corrected to the exact local migration command and the actual 24 helper tests. The parent re-extracted and verified the corrected 19-payload validation archive. This is artifact review, not independent live execution. Claude Opus 5.5 medium reported no unresolved decision-trail flags; existing visual and lower-level-only proof limits remain disclosed.

## Decisions

Model the Domain kept the goal in the existing typed Organization settings contract and represented a blank client draft as `number | null`. Laziness Protocol reused the existing reader, API, card and stale-target guards, adding no abstraction or request waterfall. Boundary Discipline validates strict integers at the API and database boundaries while preserving older policy rounding.

Prove It Works used the same dated fixture through the real app and inspected actual downloads. Test Behavior, Not Implementation asserts literal readiness percentages, admitted writes and denied effects. Sequence Work into Verifiable Units separated baseline, pure behavior, database replay and final native proof. Separate Before Serializing Shared State gave one implementation writer and one browser owner. Guard the Context Window supplied bounded briefs without conversation inheritance. The validation archive contains the append-only decision trail; timestamps are log-entry times.

## Durable artifacts

Captures were scanned for credentials and token-bearing URLs. No redactions were required. Each archive contains `inventory.json` with original relative payload paths and SHA-256 of expanded bytes. Each was re-extracted into fresh ignored scratch space; file sets and every payload hash matched.

| Archive                                    | Payloads | SHA-256                                                            |
| ------------------------------------------ | -------: | ------------------------------------------------------------------ |
| [Baseline](baseline.tar.gz)                |       32 | `0b2f279ddc5b7f22b849cfdb35d6617e9a09c3bca82b369077c7530d6a9a631a` |
| [Final native proof](final.tar.gz)         |      159 | `72ebffdbd185f85f7af876c428c5f127d94320cc09729d83411bec34a9b2ff4a` |
| [Validation and review](validation.tar.gz) |       19 | `73af61b577db8e4d8144baaaa1d5842fb9afcef89c4c3b1fc7439de7cd727df6` |

Extract a chosen archive with `tar -xzf ARCHIVE -C EMPTY_DIRECTORY`. Compare its SHA-256 with the table, then compare the extracted payload set and each file's SHA-256 with `inventory.json`. Begin with `observations.md` in baseline/final and `results.md`, `delegation.md`, `decisions.tsv`, `gate-accepted.log`, `build-accepted.log` and `database-accepted.log` in validation. Earlier startup/validation attempts are labeled superseded in those observations.

## Release obligations

Apply `20261004000100_training_readiness_goal.sql` through the authorized release process before deploying code that selects the new column. This task never applied it remotely. Continue issues 1502–1504 on this branch and PR to complete parent 1433. Parent completion and deployment are not claimed.
