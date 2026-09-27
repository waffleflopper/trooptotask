# Verification toolkit acceptance

This tooling slice starts from D03's merged [PR #1384](https://github.com/waffleflopper/trooptotask/pull/1384), main revision `f03a11236c89e37fe1b020488389177c755c45f5`. [Workflow #1275](https://github.com/waffleflopper/trooptotask/issues/1275) and the stabilization queue remain unchanged. No application source, schema, production provider, existing local database, or authentication behavior was changed.

The installed entry points are [t2t-engineer](../../.agents/skills/t2t-engineer/SKILL.md), [t2t-verify](../../.agents/skills/t2t-verify/SKILL.md), and `npm run verify:app -- --help`. The initial [Feature Map](../../.agents/skills/t2t-verify/references/feature-map.md) covers normal synthetic login, Group creation and persistence, denied Group writes, and Group-scoped Personnel reads. The [upstream record](upstreams.md) contains exact versions, licenses, readable article sources, MCP registration, and setup instructions.

## Candidate and environment

The current executable candidate is `f1ca644eaa3b3f92bef5c34766da727fb3f1b2e4775a6ed517e2a00f67fbaa3b`, based on the revision above plus this PR's executable changes. The last complete pilot below ran on prior candidate `7412c1451ac25d0b1e9a44db965080664d3dd6d8cef57c2f61bcfe9424ff20bf`, before the interruption-recovery repair; it does not approve the current candidate. The toolkit hashes tracked and nonignored untracked file contents; Markdown records and dotenv files are excluded. Each drive also checks the private copied source and actual production build. Markdown evidence updates do not silently approve executable changes. Receipts are sealed with a private checkout key; imported or edited receipts cannot become local approval.

The pilot runs `node scripts/verification/cli.mjs self-test`, which performs the maintained launch → doctor → real browser drive → observation → proof → cleanup sequence. It uses Node `24.21.0`, npm `11.19.0`, Supabase CLI `2.101.0`, Docker `29.7.2`, Chrome DevTools MCP `1.10.1`, and automatically provisioned Chrome for Testing `154.0.8037.57`. The separate installed-browser smoke used Chromium `152.0.7977.82`. CI selects the repository's pinned npm `11.12.1`.

Each worker composes `scripts/ci/database.py` to start a fresh, seed-disabled local Supabase project with a unique project ID and checked ports in `58000–64999`. It creates two synthetic Organizations, three Groups, four Personnel, and four confirmed users with explicit permissions. Sign-in uses the real form. Production build/preview use only the disposable provider URL and generated local keys, generated setup secrets, the allocated loopback app origin, `NODE_ENV=production`, and empty `PUBLIC_APP_ORIGIN`, `PUBLIC_SITE_URL`, and `APP_PUBLIC_ORIGIN_ALLOWLIST`. Contributor dotenv files and inherited provider secrets are excluded.

## Behavioral acceptance

The previous full pilot passed all **38 steps** on its recorded candidate. Every healthy and deliberately broken app compiled and launched in production mode. All five launched providers, apps, and browsers were cleaned up. Each affected claim ran before, during, and after its corresponding fault; no expected outcome was learned from the broken implementation.

| Contract/control                               | Observed result                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Group persistence, healthy → broken → restored | `PASS` → `FAIL` → `PASS`; the UI save and exact saved row survive reload only for healthy code  |
| Authorization, healthy → weakened → restored   | `PASS` → `FAIL` → `PASS`; the weakened endpoint returns 200 and saves a forbidden row           |
| Group-scoped Personnel                         | `PASS`; UI and page-data IDs include exactly Able and exclude the other three fixture Personnel |
| Changed source and old receipt                 | Doctor `INCONCLUSIVE / STALE_CANDIDATE`; receipt `BLOCKED / STALE_EVIDENCE`                     |
| Edited receipt                                 | `BLOCKED / EVIDENCE_EDITED`                                                                     |
| Required unavailable claim                     | `INCONCLUSIVE / CLAIM`; no readiness claim                                                      |
| Foreign control port / wrong checkout marker   | `BLOCKED / UNOWNED_OR_UNAVAILABLE` and `BLOCKED / OWNERSHIP`                                    |
| Changed private app copy                       | `INCONCLUSIVE / STALE_ARTIFACT`; restored doctor passes                                         |
| Mutated candidate receipt                      | `BLOCKED / INCOMPLETE_EVIDENCE`                                                                 |
| Missing or invalid mutation argument           | `BLOCKED / ARGUMENTS` before resource creation                                                  |
| Exclusive pilot with another worker            | `BLOCKED / PILOT_BUSY` for launch; `BLOCKED / WORKER_BUSY` for an occupied pilot checkout       |

These machine-readable extracts retain the consequential expected and observed results, candidate, session, origin, and time. They are a durable review record; `check-receipt` consumes the original locally sealed receipts, not these extracted summaries.

```json
{
	"candidate": "7412c1451ac25d0b1e9a44db965080664d3dd6d8cef57c2f61bcfe9424ff20bf",
	"browser": "Google Chrome for Testing 154.0.8037.57",
	"pilot": "pilot-1790475920561.json",
	"status": "PASS",
	"steps": 38,
	"claims": [
		{
			"step": 6,
			"recordedAt": "2026-09-27T02:20:29.807Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "7412c1451ac25d0b1e9a44db965080664d3dd6d8cef57c2f61bcfe9424ff20bf",
			"session": "0e5c590b-1e67-4010-ab01-b2d5d1fb2779",
			"origin": "http://127.0.0.1:40439",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "fab8e8c4-d82e-4caa-b2a8-a75ded909a66",
							"name": "Saved 33abbd4d-6250-464f-81f8-a3e3d9995d89",
							"organization_id": "7b43669b-b40f-4cac-addd-757235da5a81"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "fab8e8c4-d82e-4caa-b2a8-a75ded909a66",
					"observed": true
				}
			]
		},
		{
			"step": 7,
			"recordedAt": "2026-09-27T02:20:32.784Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "7412c1451ac25d0b1e9a44db965080664d3dd6d8cef57c2f61bcfe9424ff20bf",
			"session": "0e5c590b-1e67-4010-ab01-b2d5d1fb2779",
			"origin": "http://127.0.0.1:40439",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "7b43669b-b40f-4cac-addd-757235da5a81",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "10e2e3ce-5f68-41c0-b630-abde700c9f73",
					"response": {
						"status": 404
					},
					"savedRows": [],
					"observed": true
				}
			]
		},
		{
			"step": 8,
			"recordedAt": "2026-09-27T02:20:35.468Z",
			"claim": "personnel-scope",
			"status": "PASS",
			"mutation": null,
			"artifact": "7412c1451ac25d0b1e9a44db965080664d3dd6d8cef57c2f61bcfe9424ff20bf",
			"session": "0e5c590b-1e67-4010-ab01-b2d5d1fb2779",
			"origin": "http://127.0.0.1:40439",
			"observations": [
				{
					"expected": "Personnel UI contains Able and excludes other Group, unassigned, and foreign Personnel",
					"observed": true
				},
				{
					"expectedIds": ["e5d71f31-bc48-44e9-ae89-caa61805e9dd"],
					"status": 200,
					"observedIds": ["e5d71f31-bc48-44e9-ae89-caa61805e9dd"],
					"observed": true
				}
			]
		},
		{
			"step": 21,
			"recordedAt": "2026-09-27T02:21:45.665Z",
			"claim": "group-persistence",
			"status": "FAIL",
			"mutation": "persistence",
			"artifact": "cbce26d4b5bd4114cc06358b1a1945531e9d4c35defb08ef6f02dfbee7163847",
			"session": "6816eb1f-1498-4477-bc6b-d24b66207dc7",
			"origin": "http://127.0.0.1:44821",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [],
					"observed": false
				}
			]
		},
		{
			"step": 26,
			"recordedAt": "2026-09-27T02:22:50.442Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "7412c1451ac25d0b1e9a44db965080664d3dd6d8cef57c2f61bcfe9424ff20bf",
			"session": "93319ead-fc9d-4f32-9923-4e8565033e4c",
			"origin": "http://127.0.0.1:44637",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "dcbe3531-ce18-4ac6-8fdd-756cf7d315d5",
							"name": "Saved 0af16673-f57e-4b29-8a10-55c7ba295e21",
							"organization_id": "fdcf466b-4108-4999-8c6e-c6a9061c4080"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "dcbe3531-ce18-4ac6-8fdd-756cf7d315d5",
					"observed": true
				}
			]
		},
		{
			"step": 31,
			"recordedAt": "2026-09-27T02:23:56.219Z",
			"claim": "group-authorization",
			"status": "FAIL",
			"mutation": "authorization",
			"artifact": "ba1eac2eb944fb5a3ac23cd36dead1d0ade80cd746f66bcccc79d4b2d1fccd3b",
			"session": "38a0a78c-bca5-4bbd-a7b6-521c584b1416",
			"origin": "http://127.0.0.1:43355",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "06d2b675-bff2-48e5-9558-ec179bf8bb9c",
					"response": {
						"status": 200
					},
					"savedRows": [
						{
							"id": "aebf4523-36a5-4528-9867-d859817a4941",
							"organization_id": "06d2b675-bff2-48e5-9558-ec179bf8bb9c"
						}
					],
					"observed": false
				}
			]
		},
		{
			"step": 35,
			"recordedAt": "2026-09-27T02:25:01.920Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "7412c1451ac25d0b1e9a44db965080664d3dd6d8cef57c2f61bcfe9424ff20bf",
			"session": "7aab6a70-0dfd-4b06-a101-a5bf1a2ef5df",
			"origin": "http://127.0.0.1:34181",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "88e03201-cf90-4550-9ed6-c08c89d1c157",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "f83782bd-a456-4705-9e66-e1387bae3744",
					"response": {
						"status": 404
					},
					"savedRows": [],
					"observed": true
				}
			]
		}
	]
}
```

## Additional capability and refusal evidence

- A second worker ran concurrently with the first using its own app port, profile, Supabase project, accounts, and mutable data. After the exclusive-pilot repair, an active pilot blocked another worker's launch (`PILOT_BUSY`), an occupied worker blocked the pilot (`WORKER_BUSY`), and a verified dead pilot owner was recovered without deleting a live marker. Native MCP stdio registration listed 30 tools and drove `list_pages` successfully. The browser stayed alive between commands.
- Native accessibility/DOM snapshot, console inspection, request inspection, screenshot, and performance trace capture worked. The trace smoke reported LCP 326 ms and CLS 0; this is capability evidence, not a reproducible performance claim. The reviewed [synthetic Personnel screenshot](evidence/personnel-healthy.png) shows the retained application at the same base app revision; it predates the final toolkit hardening.
- Hiding installed Chromium from PATH exercised automatic Chrome for Testing download and installation. Missing `unzip` first returned `BLOCKED`; successful provisioning used temporary staging and an atomic cache install. No personal browser profile was accessed.
- Killing only an identified owned supervisor caused doctor and drive to refuse; cleanup removed its exact remaining resources. Cleanup during startup cancelled only the owned detached process group and provider. Empty unused worker allocations can be recovered; nonempty unmarked directories are refused.
- Provider-marker substitution was rejected before provider access. Restoring the owned marker allowed exact cleanup. The initial long project-ID truncation discovered during the pilot was repaired with IDs below Supabase's limit, and the two affected toolkit-created projects were positively identified and removed.

Local raw receipts remain under `.verification/evidence/` after cleanup. The previous healthy persistence receipt still passed `check-receipt` after its worker was removed. Private session files and keys are outside the checkout and are not published. The durable results above preserve synthetic observations without credentials, tokens, or raw network bodies.

## Repository checks and review

Local formatting, focused ESLint, Markdown links, whitespace checks, Svelte/type checking (zero errors and warnings), eight existing CI-runner safety tests, and two subprocess completion/error tests passed. Skill metadata validation passed for both project skills. The full repository/application and disposable database checks ran successfully in preliminary Depot runs.

The pre-review candidate passed [Depot run `sqvh7h59s7`](https://depot.dev/orgs/rvsvvkd4rp/workflows/8x1st130dw) on base `f03a11236c89e37fe1b020488389177c755c45f5`. The current executable candidate above has diff SHA-256 `f9eceb14a4975ea89bc036d7ce6f0922863e761c104690d8b97a4a6760f30836`, reproducible with `git diff --binary f03a11236c89e37fe1b020488389177c755c45f5 -- . ':(exclude)*.md' | sha256sum`. Its current-head hosted results are tracked on [PR #1385](https://github.com/waffleflopper/trooptotask/pull/1385); the prior run does not approve these executable repairs. Merge remains a separate review decision.

- Pre-review repository/application: format, lint, governance, Svelte/types, **572 Vitest files / 5,118 tests**, and production build passed. Eight Python safety tests and documentation checks passed. Svelte/type diagnostics: zero errors and warnings. Governance preserves the existing 1,292 owned Phase 08 findings without new regression exceptions.
- Pre-review disposable database: fresh migration replay, **40 SQL contract/regression runs / 944 assertions**, provider probes, and **nine populated-upgrade runs / 100 assertions** passed. Both exact projects (`t2t-ci-db-aeti36rq` and `t2t-ci-db-8jvf480n`) were stopped and removed by the existing runner.
- Material warnings: CI download caching was unavailable but installation completed; the production build retains the existing optional `@opentelemetry/api`, chunk-size, and mixed-import warnings. No warning was converted into a skipped required check.

The primary independent implementation review used `gpt-6-sol` with `xhigh` effort and focused on ownership, cleanup, evidence integrity, and falsifiable claims. Findings about edited receipts, malformed launch arguments, interrupted startup cleanup, fast child exits, concurrent issuer-key creation, and mixed-candidate pilots were fixed and re-reviewed with no remaining blocker in those paths. No broad style cleanup was added. A later PR review found four valid issues: the pilot coverage wording, early supervisor exit reporting, unreadable `/proc` entries, and exclusive access during the pilot source-change control. Those were repaired; the prior candidate passed the same 38-step pilot and healthy receipt check. A follow-up review then found that an interrupted pilot could leave an orphaned lock. The current source uses a process-owned marker and removes only a verified stale marker. Focused formatting/lint/tests, active-pilot launch refusal, stale-owner recovery, and occupied-worker pilot refusal passed locally. The complete pilot and hosted checks for this last source change remain pending.

The dependency audit introduced no new advisory names compared with the base lockfile: both report the same 17 advisories (2 low, 8 moderate, 6 high, 1 critical). Those existing dependency findings are outside this tooling slice. The three new development dependencies are exact-pinned; no Playwright dependency or tracked browser-spec suite was added.

## Limits and publication boundary

The supervisor currently requires Linux `/proc`, local Docker, Python, and Supabase CLI; it is not a native macOS runner. Chrome provisioning needs network access, `unzip`, and system browser libraries. A fresh agent session may be needed to load project skills/MCP; the CLI works without that reload. No manual setup remains on the verified workstation.

The initial claims do not cover MFA, invitations, recovery, Personnel writes, every permission combination, or other product areas. Local console inspection observed Vercel analytics/speed-insights script 404s, a form-field name/id accessibility issue, and an unused preload warning. Those are recorded observations, not a clean-console assertion or new product repair scope. Missing claims remain `INCONCLUSIVE`; ambiguous future requirements must stay unresolved in the Feature Map.

Publication is limited to one tooling PR. `vercel.json` disables Git deployment for the exact tooling branch because existing branch pushes otherwise create Vercel previews; other branches and hosted settings are unchanged. Depot validates the candidate without deployment. There is no merge, production deployment, phase-issue edit, or next application deliverable in this slice.
