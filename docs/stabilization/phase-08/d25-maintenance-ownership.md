# D25 scheduled maintenance ownership

Issue [#1373](https://github.com/waffleflopper/trooptotask/issues/1373) remains open. The verification deliverable [#1519](https://github.com/waffleflopper/trooptotask/pull/1519) merged as `988efcc03259c92157716c1cd6a77b7dba8a8b20`. The [second deliverable #1521](https://github.com/waffleflopper/trooptotask/pull/1521) completes the cohesive source-owner cutover and repairs the admission and large-cohort defects exposed by [the unchanged-app baseline](d25-maintenance-baseline.md). Final service and isolated SQL evidence pass. Complete independent source/expanded-artifact acceptance passes subject to the corrected documentation wording. Current-head full CI, completed hosted review and Robert's manual database step remain before merge. D25 can finish after verified integration; it is not complete yet.

## Scope and decisions

Scheduled Maintenance owns shared bearer authorization, archive cutoffs, seven ordered family calls and count-only administrator summaries under `src/features/scheduled-maintenance/index.server.ts`. Organization owns complete configuration enumeration. Personnel, Critical Tasks, Calendar and Onboarding own discovery, eligibility and deletion; Audit and Identity retain their existing cleanup owners. The scheduler consumes typed operations instead of a generic foreign-table store.

The two independent design investigations selected an Organization-and-cutoff Critical Tasks RPC. No caller needs an application-discovered task manifest. One fixed-size POST avoids oversized ID-filter URLs and keeps reference checks and deletion in one operation. Calendar retains its existing atomic RPC after complete owned discovery. Splitting Calendar's candidates into separate RPC batches would add partial-family commits, so the candidate sends one complete POST body. Onboarding retains its existing guarded 100-ID parent deletions and progress cascade behind typed complete discovery.

Identity admits the four exact configured job paths without a session so their handlers can check the bearer secret. Missing or wrong secrets fail before privileged work; nested and private paths remain private. The schedules in `vercel.json` are unchanged. The unused Personnel alias and verification selector are removed after a maintained-caller census. External schedules remain uninspected.

Identity setup cleanup returns exact mutation and three exact history counts without downloading token hashes. It preserves the existing timestamp union before each non-null history-category filter, active-link count, claimed links, Access Requests and User Accounts. Missing, negative, fractional or unsafe counts fail closed. The response fields are unchanged.

Laziness Protocol retained Calendar's existing transaction and the established Onboarding deletion model. Boundary Discipline moved provider validation and resource predicates to their owners. Migrate Callers Then Delete Legacy APIs removed replaced paths with their consumers instead of retaining compatibility wrappers.

The throughput checkpoint uses two bounded writers for Critical Tasks SQL and Identity behavior, with root owning shared integration and proof. Source inputs freeze before owned service verification. Independent source and expanded-artifact review follows implementation; no agent drives another worker's service.

## Consumers and test disposition

The four configured handlers bind admitted providers through public owner entries. The archive and Onboarding handlers no longer bind generic DataStore discovery. Critical Tasks and Calendar expose the factories and retention types consumed by the archive handler and scheduler. Identity issuance, completion and delivery fake stores migrate the changed cleanup operations without compatibility methods. UI, export and ordinary feature permission interfaces remain unchanged.

The central archive use case and its tests move to Scheduled Maintenance. Scheduler tests cover shared cutoff normalization, all seven literal family counts, Organization dispatch, replay, summaries and ordered failure. Generic table-selection fakes are replaced by owner-specific real-SDK tests and actual SQL guard/concurrency checks. Calendar covers complete 1,001-row discovery and its guarded existing RPC. Onboarding adds complete typed discovery and later-page failure while retaining parent-delete, history, replay and partial-failure tests. Route tests retain real-SDK complete Organization and administrator enumeration, denied admission and post-deletion summary faults. Identity tests cover exact bulk mutation/history counts, timestamp-union behavior, malformed provider counts and composed anonymous admission.

`retentionSupport` was already removed by D17. The removed central `archiveRetention` path no longer creates the historical cycle, and D25 claims no fresh deletion of `retentionSupport`. The maintained caller census finds no legacy archive imports, Calendar cleanup wrapper, generic Onboarding discovery, setup `listCleanupEligible` or Personnel alias consumer. The alias's intentional anonymous-denial test remains.

The module registry moves the Scheduler root and consumes its server entry without new dependency allowances. Governance retains the five existing route-level admin-provider exceptions because those handlers still construct admitted clients. Only three explanatory reasons change. Scan coverage, classifications and budgets remain unchanged.

## Candidate and verification

The source base is `988efcc03259c92157716c1cd6a77b7dba8a8b20`. The frozen executable and driving-input fingerprint is `6184d2e3e7a9576a0116340dc946c38592cf078165528573fe0a0ab0aafb7645`. Runtime proof uses Node 24.21.0, Supabase CLI 2.101.0, PostgreSQL 17.6 and the owned Chromium 152.0.7977.82 session. This is headless job/API and privileged provider proof; no native UI journey is claimed.

Focused integration passes 13 suites and 175 tests. Maintenance/network helpers pass 28 tests and skill metadata validation passes. The type check reports zero errors and warnings. Current governance passes with no increased exception or dependency allowance. The complete candidate command sequence remains a CI acceptance gate.

Fresh migration replay and populated upgrade pass through the original candidate version `20261003000300`. The existing isolated CI runner disables legacy seeds, allocates separate unused 58000–64999 ports and runs `npm run db:test` from its copied disposable project. Both projects are disposed. The new Critical Tasks guard, concurrency and populated-upgrade contracts pass with effective grants and full retained-row comparisons. The new Audit contract proves the strict one-year boundary, exact A/B/global deletion count and replay.

The first SQL attempt failed one overlap-wait assertion. Actual blocking diagnostics show the second cleanup queues behind the first cleanup, while that cleanup waits on the writer. The corrected test asserts that observed queue and preserves the independent deletion/count/history assertions. The rerun passes 88 SQL test invocations and 2,101 pgTAP assertions. A separate owned negative control uses `FOR NO KEY UPDATE`; it fails saved completion count, task and history assertions 5–7 and 21–22. The exact accepted RPC definition is restored before that project is disposed.

A service-preparation attempt stops before any job invocation because the scratch readback used `fixture.json` instead of `fixtures.json`. After correction, all 33 recorded seed collections are confirmed absent, final doctor passes and the owned project is disposed. The final service run begins on a new project. The preparation failure is retained separately from final evidence.

The live large setup probe disproves the earlier controlled SDK assumption that PATCH representation is capped. The owned provider returns and mutates all 1,001 expired links. Its separate history GET returns only 1,000 eligible rows and reports 998 revoked histories instead of the exact 1,002. The numeric mutation count avoids token-bearing representations; the history HEAD counts repair the observed truncation. The old probe's rows are restored exactly before the admitted candidate run. Controlled SDK red evidence remains labeled separately from this actual provider observation.

The final service run also catches a scratch stdout flush failure while printing the large journal manifest. No large-cohort job has run at that point. The complete small proof remains intact; the readback output flush is corrected and the same untouched large cohort is read and verified in the resumed stage. The original truncated bytes and failed assertion are retained. No application, migration, fixture or expected product outcome changes during the run.

The final production-mode owned session is `c9aee2d7-d6ff-49ec-855e-5f4742360487` at `http://127.0.0.1:36265`. Missing and wrong credentials return 401 for all four jobs in both cohorts, with exact recorded rows unchanged. Small archive counts are `[1,2,2,1,2,1,1]`, totaling 10; the large cohort deletes exactly 1,001 Critical Tasks and 1,001 Calendar types. Onboarding deletes 2 and 1,002 terminal packets respectively. Audit deletes exactly two old A/B rows in each cohort. Setup cleanup reports 1 and 1,001 newly revoked links, with the large history counts exactly 1,002 revoked, one completed and one failed. Every replay reports zero new effects; setup history and active-link counts remain accurate.

Full selected row comparisons preserve retained library references, eligibility sentinels, Onboarding progress and history, claimed links and Access Requests. Public Auth user fields compare equal; secret account fields are intentionally not copied. Small Personnel cleanup clears the four saved Evaluation references and preserves other fields. Expired recorded files are absent; retained and unrelated file sizes and SHA-256 values match. Archive and Onboarding summaries reach every current A administrator once per cohort, contain count-only messages and null links, and create no foreign summaries. All 33 journal collections are absent after each cleanup. The fourteen original A/B source collections compare equal after excluding the expected administrator notifications, which remain until owned disposal. Final doctor and disposal pass, and the app log is preserved.

The archives below retain 502 sanitized payloads. No live credential or token hash is included, and no redaction changes an observed result. Static test keys and the named synthetic bearer fixture are unreachable test values. Scratch bytecode and private worker state are excluded. Every archive is re-extracted into fresh ignored scratch space, with an exact payload-file set and all expanded hashes verified. Historical baseline archives remain immutable. Packaging happens after final doctor and disposal and changes the publication fingerprint; it is not a new live run. `source-inputs.json` in the work archive binds the executable inputs and deleted paths to the tested source base.

| Run                                                       | Archive                                                               | Payloads | SHA-256                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------- | -------: | ------------------------------------------------------------------ |
| Focused checks, source inputs and review dispositions     | [Work](d25-maintenance-ownership-work.tar.gz)                         |       73 | `f9dc043e178db64ffc602c74779d215fa5c395f95c9817a20c361c7d91bf638a` |
| Successful fresh replay and populated upgrade             | [Database](d25-maintenance-ownership-database.tar.gz)                 |        1 | `d4847729d5428e469ccd7cfbfae23bf12daddcd98523dd578e786834700d5194` |
| Failed overlap assertion and blocking diagnostic          | [Database attempt](d25-maintenance-ownership-database-attempt.tar.gz) |        7 | `c3caab8802fe23dec15b45526fd240ad133a71b37d52aaba726a42b06b42c48d` |
| Failed scratch preparation and weak-lock negative control | [Preparation](d25-maintenance-ownership-preparation.tar.gz)           |       91 | `308fb3c5f78ed9578442af993ea2fbf16b10d88ca854b17aac8d38a2202caedd` |
| Final service, provider rows, files, failures and cleanup | [Final](d25-maintenance-ownership-final.tar.gz)                       |      330 | `4abd807c652800a1c60dcd5f684a76442e0e207b3adc8492fb47d26d350f1a86` |

Verify the archive hashes against the table, then check expanded payloads from the repository root:

```bash
sha256sum docs/stabilization/phase-08/d25-maintenance-ownership*.tar.gz
python3 - <<'PY'
from pathlib import Path
import hashlib, json, tarfile, tempfile
parent = Path('.verification/d25-archive-readback')
parent.mkdir(parents=True, exist_ok=True)
for archive in sorted(Path('docs/stabilization/phase-08').glob('d25-maintenance-ownership*.tar.gz')):
    with tempfile.TemporaryDirectory(dir=parent) as temporary:
        root = Path(temporary)
        with tarfile.open(archive) as capture:
            capture.extractall(root, filter='data')
        inventory = json.loads((root / 'inventory.json').read_text())
        files = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
        assert files == set(inventory) | {'inventory.json'}
        for name, digest in inventory.items():
            assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest
        print(archive.name, len(inventory), 'PASS')
PY
```

The independent comment review finds no added comments or suppressions. Both changed-code comment findings and the obsolete Critical Tasks fake discovery entry are removed before the source freeze. Older setup-claim fake precedence and placeholder token-hash types concern D02 claim/completion behavior, outside this cleanup operation; they are not claimed repaired. Other old narrative comments do not gate this deliverable. The installed Deslop skill is absent, so root applies its cleanup checks directly, reviewing unused APIs, compatibility wrappers, generated files, exception changes and the full diff.

CodeRabbit CLI completes the committed candidate `4fe074dff176b7ce728b3cedc57635f49caf687f` against `0fa2960956572a8f5dea2de2ab5c8d4893178589` with zero findings. It reviews all 50 text changes; the five unsupported archives are excluded. Renames expanded, the whole PR has 58 changed paths. Fresh independent acceptance reads the complete source diff and all 502 freshly extracted/hash-verified payloads, including actual response/retained-row/notification comparisons, both drivers, failed probes, SQL and the negative control. It accepts runtime, SQL, tests, consumer/removal coverage, proof reuse and the cohesive grouping, finding no D25 remainder after required gates and integration. This is artifact review, not independent live execution. Its one required finding corrects branch-relative wording in four current architecture/retention docs; release and acceptance caveats remain here and in RELEASE. The optional request to restore inline guard/cascade narration is not adopted because the owner operations and SQL contracts expose that behavior. Prose-only follow-up review and documentation checks remain for the correction; no runtime input changes.

Before publication, fetched main advances to `0fa2960956572a8f5dea2de2ab5c8d4893178589` through the separately owned D26 #1520 policy repair. Integration preserves both owners' release notes, architecture records and upgrade-runner registrations. D26 changes only the Getting Started policy and its own verification/docs; no cleanup runtime, resource table, retention predicate, RPC definition or grant changes. The new D25 migration is renamed from tested version `20261003000300` to `20261004000200`, placing it after D26's `20261004000100`. Its SQL bytes and SHA-256 remain identical. Historical archives retain the original version and runner, and their proof is reused only for those unchanged cleanup inputs. This is base reconciliation and migration-order repair, not a fresh live run. Current-head CI must verify the combined fresh and populated migration chain and the complete command sequence before acceptance.

## Release and remaining boundary

The additive migration [`20261004000200_critical_task_archive_retention.sql`](../../../supabase/migrations/20261004000200_critical_task_archive_retention.sql) has SHA-256 `0f6a4e55c4f12ce0e0e2c5db8fd8599cb0c304271bd04eceaf5b5bac863d9c3b`. It adds a service-only invoker RPC with an empty search path and requires `READ COMMITTED`. It changes no existing stored rows, tables, foreign keys, RLS policies or table grants. [The release entry](../RELEASE.md#phase-08-d25-scheduled-critical-tasks-retention-rpc) records migration-before-caller ordering and the manual hold before merge. No remote database operation or hosted parity inspection is performed.

The archive job is not one transaction. Earlier families can remain committed after a later family or notification error. Personnel's existing child restore/file-cleanup limits remain; this cutover does not promise atomicity across all resources. A transport outcome after commit can be unknown. Replay prevents new duplicate deletions but cannot recover a lost original summary count. External schedulers and deployment settings remain uninspected.

This candidate does not advance another issue. Whole-issue acceptance and authorized integration remain required before #1373 can close.
