# Training Reports slice 1503 acceptance

Slice [1503](https://github.com/waffleflopper/trooptotask/issues/1503) implements the server and top half of the Training Reports briefing. It continues slices [1501](../training-reports-1501/acceptance.md) and [1502](../training-reports-1502/acceptance.md) on draft [PR 1511](https://github.com/waffleflopper/trooptotask/pull/1511). Parent [1433](https://github.com/waffleflopper/trooptotask/issues/1433) remains incomplete. Independent source and expanded-artifact acceptance pass for this slice.

## Delivered behavior

The page has URL-kept View, Group, Rank, MOS, Duty role, Types, Horizon and Rows by controls, Bottom line, Forecast chart and Hot-spot grid. The server renders the filtered first paint. Changes refetch without navigation or an initial duplicate summary request. Superseded requests cannot replace the displayed briefing. Failed changes restore its controls and offer Retry for the attempted selection.

The page and all three existing APIs retain `training.viewRecords`, authorized roster scope and ordinary request RLS. Organization owns the narrow name-and-goal reader. Summary results omit raw roster and record data. Detail re-derives cell or focus requirements, defaults to 25 rows, caps at 100 and carries no record IDs in the URL. The existing single-sheet Excel workbook uses the briefing's filtered population and required saved-view columns.

The amended success, warning and destructive bands use unrounded counts and the saved goal. Forecast labels avoid grid and goal rules. The chart includes the short final bucket and a screen-reader data table. Visual implementation and acceptance used T3 Claude Opus 5.5 at medium effort with bounded prompts. The [maintained recipe](../../../.agents/skills/verify-trooptotask/features/training-completions-reports.md) records current controls and expected behavior.

Type risk bars, Focus areas UI, the full Affected soldiers table, five-sheet workbook, Print brief and remaining legacy deletion belong to [1504](https://github.com/waffleflopper/trooptotask/issues/1504). Dashboard and Personnel retain their separate currency measures. The approved existing server-calendar convention supplies today; no Organization timezone setting was added.

## Current candidate and checks

The tested revision is `c09b67376abc3936e1b141407c6759b362fe5c6a`, including main `6555c3c884801e46bd0fc78a94d698c30ec76d88`. The uncommitted application, script and SQL patch has SHA-256 `32708d9529e3554a1c560101db922fb5588f017e7a10e9afdc6db3384049ff07`. The chart has SHA-256 `706cd892350695097546eba779f989db5df81d8834b92fce2a677cf40ae7b831`, unchanged across v6, v7 and v8. Later archives and acceptance prose change the checkout fingerprint without changing tested executable bytes.

Node 24.21.0 and npm 11.19.0 ran every required command successfully. `npm run format`, `format:check`, `lint`, `governance:check`, `check`, `test -- --maxWorkers=4` and `build` all exited 0. All 687 test files and 6,815 tests passed. Type checking reported no errors or warnings. Lint reported ten warnings in historical proof scripts and three existing Calendar and Onboarding warnings. Governance regression checks passed with 303 historical findings still open. Existing build warnings remain in the complete logs.

`python3 -B scripts/ci/database.py` exited 0 using Supabase CLI 2.101.0 and Postgres 17.6. Fresh replay applied all 169 migrations and reported 1,805 pgTAP tests. Populated upgrade applied 28 held migrations after 141 predecessors, with 22 before fixtures, 24 after contracts and 391 reported pgTAP tests. Retained ordinary-provider probes also passed. Both seed-disabled disposable projects, directories, containers, networks and volumes were absent after cleanup. No remote or existing development database was reset or migrated.

The complete nonvisual source review covers all 102 cumulative text entries, six tracked historical archives and eight then-untracked 1503 archives. It reuses unchanged prior reviews explicitly and checks current migration integration and consumers. The [final independent report](independent-acceptance.md) adds the current browser and validation packages, final census and documentation checks. Its SHA-256 is `cd3e54b63594d997c49af701ebaf306841d95f2b253f7813e6d65b417444dd24`. This is source and artifact review, not independent live execution or model diversity.

## Owned-browser observations

Robert authorized the owned `verify:app` browser after T3 preview input and capture were unavailable. Current v8 used Linux Chromium 152.0.7977.82, `orgOwner`, session `8f3afad2-9a4d-4eb1-9acd-decfee2122a0`, origin `http://127.0.0.1:33003` and candidate `0196ae3f0e438f64565069e6dfc94525a4f1865678b71035fe5a5834a4bcda1d`. Source digest is `2447cdacc44c8748e2fa6329362110cb5e99c7b5f155e3fcee8997cd507871e9`; build digest is `1bd8c303ce0e8862238dae328cd594435481f489cdb1fcd71a155a4f1a269b4d`.

Native sign-in, shell navigation, filters, Duty role grouping, 180-day reload, cell selection, Settings goal changes, chart edge cases, visible Export Excel and Sign Out passed. The mixed fixture shows 100 Soldiers, 752 ready of 1,013 applicable requirements, 261 not recorded and 139 lapses, with 74% today and 61% at the horizon. Independently rounded loss is 14 points; subtracting the rounded endpoint labels gives 13.

The filtered reload made no initial summary GET. The cell returned 25 rows with `private, no-store`. Separate HTTP and privileged-provider observations establish HTML, response headers, saved values and restoration; they do not substitute for native actions. The actual downloaded workbook is 12,254 bytes with SHA-256 `b4f463675c8ddb810c2d0f2fe244c36c81339bd25e877568e358f46c7155b69e`. Its 100 People, 12 view columns and literal statuses match the fixture, with 613 Current, 139 `10d left (2026-10-14)`, 261 Not Done and 187 N/A.

Current v8 confirms the goal-85 final-bucket turn and goal-95 flat-100 label in 1440 light and 390 dark, including DPR2 captures and loaded IBM Plex Mono. Earlier v7 supplies broader proof on the identical chart bytes at base `0fa2960956572a8f5dea2de2ab5c8d4893178589`, revision `3c0b6f2a`, candidate `7159b96787d5d6d603762d3a54db05ed260b50fd849911e59ffee80c70cbc055`. Its 684 URL-navigated states were measured read-only; they are not 684 native filter actions or independently judged screenshots. Native v7 actions cover pending/error/Retry, keyboard focus, filters, goals, cell selection and download. Earlier v3 supplies qualified race, access and fault observations on its own revision.

Fresh Claude artifact judgment found the displaced label and narrow glyph-to-rule gap nonblocking. It viewed 13 saved images, not every sweep capture. Live fallback-font rendering, a real screen reader and Mac or HTTPS browser execution remain unverified. No new full sweep, race, access or injected-fault execution is attributed to v8.

## Corrections and cleanup

The original v8 report's start time is incorrect. The 233 native CLI receipts span 4 October 2026, 02:22:59 to 02:38:24 AKDT. Its brief incorrectly expected SPC readiness of 25%. The seeded MOS-only rounding type also applies to two original People, yielding six requirements, one ready and 17%. The sole nonzero wait for 25% remains visible. The first Training click dismissed What's New; its first image therefore shows Dashboard.

Two supported analysis commands also failed. The missing PIL montage dependency was recovered with `magick`; an incorrect expected detail filename was corrected to the saved `.network-response` file. These failures remain separate from native CLI receipts and do not change the observed application outcomes.

The v7 report overstated common zero label displacement and said Paper lacked that placement. Actual displacement exceeds 0.5px in 352 start and 342 end labels, with maximum 11.7px. The saved Paper capture shows the same placement across a gridline. Successful v7 Paper responses remain archived; the fresh artifact judge's later Paper reads timed out. Original reports remain unchanged with these corrections recorded separately.

Both accepted browser runs restored complete original Organization and Training rows, including goal 90. Root verified all 966 exact seeded IDs absent, final doctor, cleanup and owned worker/profile absence for each run. Theme absence was captured and restored. V8 did not capture the prior What's New last-seen value, so complete original localStorage equality is unknown. Cleanup reclaimed only the owned private profile.

Earlier visual failures and unavailable v6 proof remain separate. V5 used Linux localhost after an HTTPS deviation and failed the goal-95 label case. V6 reached the HTTPS login page but delivered no native login, chart, controls or download proof. Historical check failures, root's corrected local merge-conflict mistake, evidence redactions and their outcomes remain in validation records. No failed or unavailable attempt is relabeled as current acceptance.

## Durable artifacts

Each archive contains `inventory.json` with every payload path and SHA-256. Fresh extraction and complete payload-hash checks passed for every archive. Current v7, v8 and validation UTF-8 credential scans passed. Validation replaces 18 credential-shaped query values only in a historical failed-test log; source patches and current logs retain their bytes. The independent report verifies the complete expanded current observations. Publication adds only that exact report and this status/link update after the reviewed 119-path checkpoint, for 120 cumulative changed paths. Explicit formatting, local links and whitespace checks are repeated at closure. No application source changes follow the accepted browser run.

| Archive                                               | Payloads | SHA-256                                                            | Outcome                                 |
| ----------------------------------------------------- | -------: | ------------------------------------------------------------------ | --------------------------------------- |
| [baseline](baseline.tar.gz)                           |       51 | `fa83957d99b581bbb93df8b4337f139d827d8df9dfb3e5a8524c099248dee4c9` | Historical baseline                     |
| [visual failure](visual-failure.tar.gz)               |      408 | `04d94812ab5c1543f3fe783f64dc9a981bae1b9bcdb02cdd15e39130ea3d0925` | Failed                                  |
| [visual failure v2](visual-failure-v2.tar.gz)         |      408 | `506cdc2433025c1beebec1c8c9cb8e5d779db718498280f604cfd0281c266a5f` | Failed                                  |
| [visual failure v3](visual-failure-v3.tar.gz)         |      549 | `973f3cb2fd148afc95784530a38e902a1f0eb16fee3630a3478f4a2c88410299` | Failed                                  |
| [visual failure v4](visual-failure-v4.tar.gz)         |      400 | `bf1a94039ba6d48bb56a38ec4c5f1c3221a1746a3d70834221849a45a5403bc7` | Failed                                  |
| [visual failure v5](visual-failure-v5.tar.gz)         |      441 | `f316ce2e80ac8f038530c2cf1093b0ac834483face74caa9fb24566dca018d8b` | Failed; browser deviation               |
| [visual unavailable v6](visual-unavailable-v6.tar.gz) |      126 | `8e44e2ba1a5005c74b977816ac1c0e6478fa13e3f2e3e162f99855dcc1ae6ff5` | Native outcomes unrun                   |
| [final v7](final-v7.tar.gz)                           |    9,516 | `447f9332647bdbf5e10b782a4b557cf1945318edea6935ee5ed487ae74fe7200` | Broad scoped pass; prior base           |
| [final integration v8](final-integration-v8.tar.gz)   |      918 | `0469994bbce1b9e38229573a55c2f8b704f0f5831783232156b3528a98d4836b` | Current scoped pass                     |
| [validation v8](validation-v8.tar.gz)                 |       40 | `c59b77f146140d46f2879a83e9d3bbf3f97470a7abd9574b4a9e56319995402e` | Current source, checks, SQL and reviews |

Extract a chosen archive with `tar -xzf ARCHIVE -C EMPTY_DIRECTORY`. Compare the archive hash with this table, then verify the expanded file set and every payload hash. Packaging integrity does not establish application behavior.

```python
import hashlib
import json
from pathlib import Path

root = Path("EMPTY_DIRECTORY")
inventory = json.loads((root / "inventory.json").read_text())
actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and p.name != "inventory.json"}
assert actual == {entry["path"] for entry in inventory}
for entry in inventory:
	assert hashlib.sha256((root / entry["path"]).read_bytes()).hexdigest() == entry["sha256"]
```

## Release obligations

Apply `20261004100618_training_readiness_goal.sql` through the authorized release process before deploying consumers of its column. Its SQL bytes are unchanged from slice 1501. The unreleased filename changed to avoid main's progress-scope and Critical Tasks retention migration collisions. Current fresh and populated replay verifies the unique timestamped chain. Main's independently owned release obligations remain in force. This task does not apply remote migrations, deploy or merge. Keep PR 1511 draft until the remaining slice is implemented and accepted.
