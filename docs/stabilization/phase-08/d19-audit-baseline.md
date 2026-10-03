# D19 Audit verification preparation

## Declared outcome and reconciliation

D19 [#1367](https://github.com/waffleflopper/trooptotask/issues/1367), parent #1281/milestone 6, maps to `08-M13-01` and retained R1/R5. This first PR supplies usable verification preparation and actual unchanged-app observations. It does not accept the Audit ownership cutover or the reproduced disclosure defect. Robert authorizes publishing and merging successive non-migration deliverables after green exact-head CI and completed bot reviews without actionable feedback, continuing only this issue. A migration stops that merge sequence for his manual remote application.

The clean starting branch was `t3code/phase-8-verification`, tree-identical to fetched `origin/main` `c0beb00abc5022a76b6774a55c8baca95abd27ef`. Branch `stabilization/1367-audit-baseline` preserves other worktrees. Paginated issue/comments/all-state PR reads established D19 open without a competing PR. D01 #1379 (`5c61f22b`) and D05 #1404 (`ee8f00a2`) are accepted ancestors of that default. #1366 remains separately owned; its new #1498 is unrelated to this PR. Default was fetched again after proof and remains unchanged. The parent's historical next-child sentence receives no integration credit.

## Scope and issue remainder

The authoritative [recipe](../../../.agents/skills/verify-trooptotask/features/audit-capture-projections.md) owns actions and expectations. Existing owner/admin/member/foreign and super-admin/support roles are reused. This PR adds temporary stored-event witnesses, a precisely scoped navigation-failure control and two missing lower-level disclosure cases. It changes no production application behavior, migration, schema or deployment configuration.

The concrete split is an independent usable verification outcome before the complete shared ownership/consumer cutover. The verification outcome deliberately exposes failed expectations. It keeps #1367 open and the dependent cutover blocked on repair; individual related product defects are not split into further PRs.

The whole-issue remainder is owned recording/query/masking and provider adapters; source-owned referenced Personnel/Training and actor-email reads composed at delivery; every producer/public/route/Platform/dashboard/export/job consumer; obsolete-path removal; repair of the dashboard disclosure; matching final live/lower proof; complete independent acceptance and integrated DoD/CI/review. Preserve Calendar's existing status-label contract and Identity event meanings. Audit imports no event producer; Access's injected sink must avoid an import cycle. The unused preview is not a live entry point. D18 #1366 retains deletion rules/effects; reconcile its actual Audit consumers after integration.

## Actual observations and limits

| Boundary | Observed result and artifact pointers inside the baseline archive |
| --- | --- |
| Owner summaries | Latest 100 ordered IDs match privileged provider readback; total 106, recent 105. Client paging, search, keyboard clear, ascending sort and reload pass (`19`–`33`, `131`, `147`). Older rows are not reachable through these client pages. |
| Owner page data | Same-A Personnel/Training/Calendar labels resolve; foreign/missing references and remaining top-level UUID detail strings disappear. Saved masking, legacy actor precedence, membership email and event/user/resource references remain (`20`). Null actor is System. |
| Role/target denial | Admin/member owner-only 403; foreign A/B targets 404; support/member full Platform Audit 403. Native denials and ordinary page data are separate (`34`–`54`). SvelteKit transport is 200 with error-node 403/404 and no Audit payload. B's own summary contains only its witness (`41`, `90`). |
| Full Platform Audit | Seed action has 107 events, 50-row server pages; paging changes records. Later-page severity resets page 1, warnings count 52 with final page 2. A/B filters return 106/1. Fresh View exposes raw saved IDs with saved masking (`62`–`88`). |
| Reduced support details | User and Organization activity DTOs omit details/IP (`82`, `85`). These do not establish dashboard safety. |
| **Dashboard disclosure FAIL** | Normally admitted support receives nonempty raw saved details and serialized null IP/user-agent fields from `/admin/__data.json` (`60`). The separate follow-up's `19` captures a real Training event with actual IP `127.0.0.1` and complete browser user-agent. Denial of `/admin/audit` does not protect this reverse consumer. D19's next cutover must replace `SELECT('*')`/raw serialization with an explicit reduced projection. |
| Real authentication producer | Native failed login yields correlated `auth.login_failure`, masked unique-domain email, warning severity, null actor/Organization and no password (`93`–`97`). Seeded values are not masking proof. |
| Real Training producer | Existing editor's POST upsert records `training_record.updated` with correct actor/Organization/resource, IP and empty details. Reload/reopen proves Notes persisted; same-ID original fields are restored (`98`–`119`, `147`). Dedicated PUT supplies label references but has no native caller; its writing remains separately identified operation/HTTP proof. Seeded labels do not establish it. |
| Client recovery | Initial focus attempt did not reach Logs and is inconclusive (`121`–`128`). Actual native focus observations precede matched synthetic GET 503 and visible 503. A subsequent real GET 200 is also retained. Hook restoration/reload recovers Logs (`130`–`141`). No provider error or writer durability guarantee is inferred. |
| Owned cleanup | All 111 exact seed IDs are absent; A/B original audit sets were empty, with only two legitimate A Training updates remaining. Training's projected fields are exactly restored. Final doctor and disposal pass (`142`–`147`). |

Native empty `fill` and a raw select value did not fire the intended controls; fresh keyboard and visible-text actions pass. A stale View UID failed before a fresh snapshot/click succeeded. These failed/inconclusive attempts remain in the archive rather than being relabeled as product failures. Provider/query/writer failure guarantees need separately identified lower-level proof; the mocked adapter's synchronous no-throw check does not establish actual writer SDK failure handling. No cleanup job, remote provider or existing maintenance database was used.

## Tested versions and durable artifacts

Baseline: production app revision `53a9becb5b992ebd65a4f2317d8eb7893d02bd98`, candidate `1524b2030b758587617aa55bb43b7ef241d8ff7942bb0c1ade447312fd8a9206`, owned worker 1, native Chromium 152.0.7977.82, origin `http://127.0.0.1:37559`. Failed startup attempts are separately identified: pre-drive voluntary disposal, shell Node 26 build rejection and Node 24 Chromium socket-path abort. Each owned cleanup passed. A short task-owned TMPDIR resolved the browser failure without changing system configuration.

Affected recipe follow-up: revision `bc45bc3b145cdae2dc48affe56686cfe590d04c5`, candidate `ac7b3befbb7e01753b2b09780228c2b650e066d5d2d156830d29c481109ca6ee`, fresh worker 1 at `http://127.0.0.1:39339`, same native Chromium. It rechecks the adopted native Training/empty-detail producer, visible-text select, keyboard clearing and support dashboard expectation. All 111 seeds are removed, original Training fields restored, final doctor/disposal pass. The dashboard expectation still fails. Unchanged baseline journeys remain applicable; this is not a full independent second execution.

- [Baseline archive](d19-audit-baseline.tar.gz): 226 payloads; SHA-256 `fb99b07796e1300b46454329695b2b27f65b2020193c64c8dde00a544be424fc`.
- [Recipe follow-up archive](d19-audit-recipe-followup.tar.gz): 53 payloads; SHA-256 `199d153b9fea004327f72a47f35c1d0e13afba9ef50e502be7e68fe38bc80f68`.

Each archive contains `SHA256SUMS`, original capture filenames and a README explaining outcomes/failed attempts. Extract into a fresh ignored directory and run `sha256sum -c SHA256SUMS` there; also compare its file set with the inventory, excluding the inventory itself. Both fresh extractions were verified against every expanded hash/file. Own session tokens are redacted before saving; raw audit observations remain intact. Later packaging and receipt changes are not described as a fresh live run. The baseline README's null-value precision fix and final recipe sentence limiting lower-level claims change no native action or application input.

## Checks, review and release

Focused existing writer/query/Platform/settings/admin suites pass: 7 suites, 46 tests (`02-focused-tests.txt`). New query cases independently specify same-Organization enrichment/scoped actor email with saved masking, and foreign labels/email denial/unresolved uppercase UUID stripping. Existing precedence/security tests remain. A temporary test-only foreign-lookup counterexample failed as expected and was removed. Helper interrupted-second-insert and existing network checks pass: 9 tests (`03-helper-tests.txt`); ownership is persisted before all writes and duplicate cohorts make no write.

Independent source/expanded-artifact review verified original response decoding, loaded windows, isolation/disclosure boundaries, exact seed absence and original-field restoration. It found the reporting/recipe distinctions corrected above, with no scoped source/fixture/test defect. This is artifact acceptance by a separate same-model agent, not independent live execution or model diversity. Final integrated receipt/follow-up acceptance is pending.

CodeRabbit's complete committed source review passed all 10 changed files against base `c0beb00a`, reviewed head `53a9becb`, zero findings (`07-coderabbit-source.txt`). Later recipe/receipt/packaging material needs proportional review. Exact-head required CI/DoD remains pending; publication does not credit those results. No SQL/migration input changed.

Repository CI validates read-only application checks/build and disposable provider contracts when selected. There is no in-repo remote migration step. Vercel integration may deploy previews/merged application changes; external settings are unknown and were not changed. This PR has no migration or destructive production change and performs no remote database operation. Prior release obligations remain with their owning issues and RELEASE.
