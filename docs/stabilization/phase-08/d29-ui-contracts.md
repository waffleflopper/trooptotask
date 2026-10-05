# D29 shared UI contracts

This bounded [#1377](https://github.com/waffleflopper/trooptotask/issues/1377) deliverable removes internal cycles and repairs shared accessibility, keyboard and navigation contracts. The verification-only [#1529](https://github.com/waffleflopper/trooptotask/pull/1529) is merged. The implementation is **unmerged for Robert's review**; exact-publication-head full CI/build and completed hosted review remain gates. It uses `Refs #1377`, leaves #1377/#1281 open and does not activate Phase 09. Mixed-owner utilities, models/validators and provider seams remain under D29 after D28/#1376.

## Result and consumers

- AlertDialog/Dialog Content and Pagination Previous/Next import siblings directly. Calendar/RangeCalendar replace their own barrel imports and caption type back-imports. Public exports, props, bindings, refs and styles remain supported.
- Tooltip Content supplies stable generated IDs, honors caller IDs and exposes the tooltip role/description relationship while preserving primitive props, attachments, portal, custom child and callbacks.
- Disabled Pagination destinations cannot update the page or navigate a caller-rendered anchor through click, Enter or Space. Enabled navigation/callbacks and unrelated keys remain usable.
- Stable RangeCalendar keys preserve date identity. Its audited Bits UI 2.18.1 postinstall patch synchronizes the placeholder only when the start changes; completing an end does not recenter/remount it. New caller starts still synchronize, and explicit view/end-only updates remain intact. Version/source mismatch fails closed through the existing patch mechanism.
- Header theme activation composes its callback through Tooltip.Trigger. Shared Sidebar MenuButton closes ordinary mobile anchor navigation after existing handlers; canceled, modified, nonprimary and non-navigation activation preserve the drawer. Desktop preference stays unchanged.

The activation/navigation repairs belong together because verification exposed defects in the same shared control contract and actual consumers. The merged preparation is independently usable coverage, not a split between individual repairs. No new shared abstraction, public API, route, provider call, compatibility layer or governance exception is introduced.

The combined source-aware census scans 2,180 sources with zero parse/resolution failures and zero cycles in the six selected families. Governance passes with 160 retained findings versus 165 at current base `fa562fc395eac4201a344835b31e9d9d36af0cbd`; allowances remain three ordinary/five admin and permission couplings zero. The earlier frozen source has 2,179 sources and the same 160-versus-165 result against `9b6f9b74d76af91895cf16b063b157c1927eb1c6`. These counts establish five removed cycles, not whole-program convergence.

| Family        | Direct / reverse production consumers | Accepted coverage                                                                                                   |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Tooltip       | 4 / 73                                | Header, PersonnelImportPage, Sidebar MenuButton/Provider; native app/Admin descriptions, real consumer/public tests |
| AlertDialog   | 1 / 91                                | ConfirmDialog; actual Able archive cancellation and retained component checks                                       |
| Dialog        | 4 / 127                               | AppDialog facades and unconsumed CommandDialog; actual Personnel Edit/date picker and retained component checks     |
| Calendar      | 1 / 103                               | DatePicker; native month navigation/ArrowLeft/Enter and canceled draft                                              |
| RangeCalendar | 0 / 0                                 | Public component keyboard/bounds/callback/external-value/view contracts                                             |
| Pagination    | 0 / 0                                 | Public page/range/end-boundary/disabled/default-navigation/caller contracts                                         |

Reverse imports describe potential consumers, not rendered feature proof. Shared MenuButton's actual callers are AppShellNavigation, AppShellHeader and Admin layout; native follow-up covers app links, Header Settings/Account and Admin links. Unrelated DataTable/Admin paging does not exercise Pagination.

## Frozen verification and applicability

Node 24.21.0, pinned engineering npm 11.12.1, Bits UI 2.18.1 and Chromium 152.0.7977.82 are used. Only owned worker 2 is driven; worker 1 and existing/remote databases are untouched. Each native run finishes a matching doctor and owned cleanup before packaging or recipe adoption.

| Run                   | Tested revision / digest                                                                                        | Actual result                                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First implementation  | `86f798acc71b9b6297724b848b72bb050c23d3f3` / `aceb7cec59a524d8407e3e339b4e1fb62edf4ce0d5f92e16982f1c08d0f82915` | Four Tooltip descriptions pass. Personnel Edit boundary trapping, Calendar keyboard selection/cancel/reopen, Archive cancel and editable blocked CSV preview pass; all three stored Personnel rows are separately deep-equal. Header keyboard activation and current/ordinary Admin mobile navigation fail before their owning repairs. |
| Final follow-up       | `ba4b7d5a11fba32ea60a61bba4a523e2b7a51b64` / `c03a43fa0a67213960f51b98153a0c5f941815fd4bec324760baddcc17a578eb` | Header open-tooltip Enter/Space, Escape/pointer dismissal and theme restoration pass. App/Admin current/ordinary links close, Escape restores trigger focus and Control+Enter opens an owned new tab while preserving the drawer. Header Settings closes; Account menu preserves the drawer. Desktop descriptions/restoration pass.     |
| Merged-base follow-up | `07f5b1a7cb22c9a0793b9b788f377a2e3665801a` / `fab5b3f0d4d93a26ba38c45e2d4e06293e99c2b27dcf19fb71f2d7be61837668` | Updated real Dashboard settles and reloads without a load-error alert. Independently specified strength, Training, Evals, assignment, loss and packet facts match. Separate signed-in page-data reports Critical Tasks 1/7 = 14%. Mobile current Home and ordinary Personnel/Home close; Escape restores Sidebar trigger focus.         |

First-run successful Personnel/import/dialog/date/confirmation observations remain applicable because their affected production, fixtures and controls are byte-unchanged by the later Header/Sidebar/Pagination delta and incoming D27 correction. The first follow-up targets the actual failures and changed production consumers; no fresh native execution of unchanged form paths is claimed. Main then advanced through the Dashboard/starter request-composition correction in #1531. The separate merged-base run verifies its affected Dashboard/Home entry after integration. All 23 UI executable paths remain SHA-identical to the accepted `ba4b7d5a` checkpoint; the adopted shared UI status and incoming Dashboard recipe participate in the new fingerprint. Changes after this third run add only its archive and prose, with no application, fixture, control or driving-step change.

Public/component proof passes **seven suites / 77 tests**, including Tooltip2, RangeCalendar5, Pagination15, Sidebar8, real Header39 and retained Dialog/confirmation consumers, both before and after the new base integration. Type checking reports zero errors/warnings; all 23 changed code paths pass ESLint and all 24 frozen paths pass formatting. Official Svelte checks have no issues. Existing public ref/async-lifetime advisories remain unchanged. The merged-base owned production build passes; full required read-only checks/build still need exact published-head CI.

Original disabled page/range/Tooltip failures, unsuccessful dependency-only range patch, initial missing-env/selector/governance failures and new Header/Sidebar red tests remain in the packages. The private range variant's old test hash differs only by removal of unsupported selector option `exact:true`; final root checks cover corrected bytes. Sidebar's final root href predicate uses `hasAttribute`, accepting empty navigation destinations; worker red/green hashes and the one-predicate parent delta are preserved separately. Wrong-version/source patch refusals leave targets unchanged; fresh isolated npm ci applies the accepted guard.

Normal synthetic manager, platformReviewer, orgOwner and dashboardView sign-in establishes selected admitted views through actual content. Helper metadata alone is not admission proof. Provider row reads are separate persistence observations, not native interaction or authorization proof. The merged-base Dashboard uses journaled owned synthetic setup/cleanup; its ordinary page-data reads return selected summary fields without saving credentials. No save/import/archive mutation, RLS/security parity, performance measurement, hosted deployment or unrelated whole-feature acceptance is claimed. Raw run notes retain wrong UIDs/argument shapes, the mistaken actor CLI command, non-isolated tooltip attempts, the obsolete CSS-class theme probe and restoration attempts corrected after visible tooltips were dismissed.

## Durable artifacts

All sanitized expanded bytes are preserved. Counts exclude each inventory; the archive checksum protects its included `ARTIFACT_SHA256SUMS`. No additional redaction was needed. Fresh extraction verifies exact payload sets, hashes and original bytes; all ten new PNGs are inspected. Four distinct packages contain 571 payloads.

| Archive                                                      | SHA-256                                                            | Payloads / bytes / PNGs |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------- |
| [Component/source series](d29-ui-component-contracts.tar.gz) | `536692eae1e368e715d6376e8f1aef49ab522412df9562da6a037f358f634106` | 197 / 886,543 / 0       |
| [First native run](d29-ui-first-native.tar.gz)               | `8521739c0decf6324276d1d1d69b5c38a85ecfca0f7225bdf8930f268d14c3a7` | 183 / 1,217,674 / 5     |
| [Final follow-up](d29-ui-followup-native.tar.gz)             | `39b650687aa5546bb5e1985344e2f445706175c4e8c2bcf902f6710b122b1644` | 138 / 859,721 / 3       |
| [Merged-base follow-up](d29-ui-base-followup.tar.gz)         | `a1efb820faf790041db9759e62e4a831ee82fc2860dc7d5bfa16e66d75ca4ad5` | 53 / 559,269 / 2        |

Check the selected archive hash, extract into a fresh ignored directory, compare its file set with the inventory, then run `sha256sum --check ARTIFACT_SHA256SUMS` from the extracted directory. For example:

```bash
mkdir .verification/d29-review-followup
tar -xzf docs/stabilization/phase-08/d29-ui-followup-native.tar.gz -C .verification/d29-review-followup
cd .verification/d29-review-followup
sha256sum --check ARTIFACT_SHA256SUMS
```

The [preparation baseline](d29-ui-verification.md#durable-proof) remains unchanged at SHA-256 `735cf9d5376da818ab20c1ea9a84ea27aa740631f70eb5a0dc264f6e05c1473d`. Its original failed contracts are superseded only by the corresponding passing observations/tests above.

## Review and publication gates

Independent read-only acceptance reports Standards GO / Spec GO for the complete 31-path / 28-text packaged diff at `df67f156` against `9b6f9b74`, including all 24 frozen source/recipe paths, APIs, consumers, meaningful tests, performance scope and grouping. It independently extracts all three original packages, verifies all 518 payloads and inspects eight PNGs with no actionable findings; the preparation baseline remains unchanged. This is source/artifact review, not independent native execution or model diversity. The separate merged-base/new-artifact acceptance remains pending. The intended current PR has 32 physical paths / 28 text paths, including the four separately expanded archives.

CodeRabbit CLI 0.8.2 completes all 18 original text paths at `86f798ac` against `9b6f9b74`; its one valid disabled custom-anchor default-navigation finding is repaired with retained red/green proof. Its changed-material review at `df67f156` against `86f798ac` completes all 14 text paths with zero findings, explicitly excluding the three binaries. Their union covers all 28 text paths; unchanged reviewed source is reused. The final merged-base prose delta and hosted exact-head CI/reviews remain pending. Binary archives receive separate expanded acceptance. No actionable review or pending CI is described as complete. Robert will review the implementation PR before deciding whether to merge.
