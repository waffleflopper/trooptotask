# Verification toolkit acceptance

This tooling slice starts from D03's merged [PR #1384](https://github.com/waffleflopper/trooptotask/pull/1384), main revision `f03a11236c89e37fe1b020488389177c755c45f5`. [Workflow #1275](https://github.com/waffleflopper/trooptotask/issues/1275) and the stabilization queue remain unchanged. No application source, schema, production provider, existing local database, or authentication behavior was changed.

The installed entry points are [t2t-engineer](../../.agents/skills/t2t-engineer/SKILL.md), [t2t-verify](../../.agents/skills/t2t-verify/SKILL.md), and `npm run verify:app -- --help`. The initial [Feature Map](../../.agents/skills/t2t-verify/references/feature-map.md) covers normal synthetic login, Group creation and persistence, denied Group writes, and both Group-scoped and Organization-wide Personnel reads. The [upstream record](upstreams.md) contains exact versions, licenses, readable article sources, MCP registration, and setup instructions.

## Candidate and environment

The current executable candidate is `daedab67da5907c25ffc39718dba485e94045ac059abc7d94ccae7261d3ae0c1`, based on the revision above plus this PR's executable changes. The complete pilot and coverage-first baseline below ran on this same candidate. The toolkit hashes tracked and nonignored untracked file contents; Markdown records and dotenv files are excluded. Each drive also checks the private copied source and actual production build. Markdown evidence updates do not silently approve executable changes. Receipts are sealed with a private checkout key; imported or edited receipts cannot become local approval.

The pilot runs `node scripts/verification/cli.mjs self-test`, which performs the maintained launch → doctor → real browser drive → observation → proof → cleanup sequence. It uses Node `24.21.0`, npm `11.19.0`, Supabase CLI `2.101.0`, Docker `29.7.2`, Chrome DevTools MCP `1.10.1`, and automatically provisioned Chrome for Testing `154.0.8037.57`. The separate installed-browser smoke used Chromium `152.0.7977.82`. CI selects the repository's pinned npm `11.12.1`.

Each worker composes `scripts/ci/database.py` to start a fresh, seed-disabled local Supabase project with a unique project ID and checked ports in `58000–64999`. It creates two synthetic Organizations, three Groups, four Personnel, and four confirmed users with explicit permissions. Sign-in uses the real form. Production build/preview use only the disposable provider URL and generated local keys, generated setup secrets, the allocated loopback app origin, `NODE_ENV=production`, and empty `PUBLIC_APP_ORIGIN`, `PUBLIC_SITE_URL`, and `APP_PUBLIC_ORIGIN_ALLOWLIST`. Contributor dotenv files and inherited provider secrets are excluded.

## Coverage-first verification

The [coverage-first workflow](../../.agents/skills/t2t-verify/references/coverage-first.md) requires issue acceptance and approved contracts to be mapped to exact claims and existing coverage before refactoring. `check-claims PLAN RECEIPT...` checks every declared requirement using the existing receipt verifier. The mapping itself still needs independent review; the command cannot infer whether a prose contract was interpreted correctly.

The Personnel teaching subset initially returned `MISSING_COVERAGE` for `personnel-organization-scope` before that check existed (candidate `b0c426c2a8ee94688495939ccac190d57fd8038a2eb95dc4adec466fc68ef9c8`). The extension reused the existing viewer, synthetic records, normal login, browser driver and receipt issuer. Application and fixture code stayed unchanged. Its baseline passed before any application refactor; the existing Group-scope check also passed on the same candidate.

| Required set / input                                            | Actual result                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| Personnel Organization scope + its own fresh receipt            | `PASS`, exit 0; exact three Organization-A IDs, no foreign ID |
| Same Personnel set without a receipt                            | `BLOCKED / MISSING_RECEIPT`, exit 2                           |
| Calendar availability + fresh passing Group persistence receipt | `BLOCKED / MISSING_COVERAGE` and `UNRELATED_CLAIM`, exit 2    |

Calendar's existing unit and SQL checks are recorded as partial coverage. No Calendar actor, browser claim, or application refactor was added, and no Calendar verification is claimed. Neither teaching subset declares its entire referenced issue complete.

Two focused gate tests exercise the real issuer/verifier in a temporary checkout with a separate receipt key: complete and partial sets, unavailable implementation, missing inventory, empty sets, unrelated/duplicate inputs, failed/inconclusive/blocked evidence, actual changed-source staleness, edited evidence, missing files, and CLI exit 2. Their synthetic protocol receipts cannot approve this checkout's application. Focused independent review found no blocking issue.

The baseline extract below is review evidence, not a substitute for its sealed local receipt (`1790482540335-758db8ba-1170-400d-8443-51a12b20f83a.json`). The machine-readable set outcomes remain in `.verification/evidence/browser-review-coverage-complete.json`, `browser-review-missing-receipt.json`, and `browser-review-calendar-blocked.json` after cleanup.

```json
{
	"candidate": "daedab67da5907c25ffc39718dba485e94045ac059abc7d94ccae7261d3ae0c1",
	"recordedAt": "2026-09-27T04:15:40.335Z",
	"origin": "http://127.0.0.1:43775",
	"claim": "personnel-organization-scope",
	"status": "PASS",
	"scope": {
		"role": "viewer",
		"organizationId": "5b88fd25-33f6-4ef9-9706-7ae5cafe100e",
		"groupIds": null
	},
	"observations": [
		{
			"expectedVisible": ["Able, Synthetic", "Baker, Synthetic", "Unassigned, Synthetic"],
			"expectedHidden": ["Foreign, Synthetic"],
			"observed": true
		},
		{
			"expectedIds": [
				"001de51e-c4e5-4181-938b-d120724408d8",
				"4dbdb586-8e54-453a-ae44-92be6181a9db",
				"85505a3f-7e26-4a72-a00c-3e75a69e68bc"
			],
			"status": 200,
			"observedIds": [
				"001de51e-c4e5-4181-938b-d120724408d8",
				"4dbdb586-8e54-453a-ae44-92be6181a9db",
				"85505a3f-7e26-4a72-a00c-3e75a69e68bc"
			],
			"observed": true
		}
	]
}
```

## Behavioral acceptance

The current full pilot passed all **48 steps** on the candidate above. Every healthy and deliberately broken app compiled and launched in production mode. All five launched providers, apps, and browsers were cleaned up. Each affected claim ran before, during, and after its corresponding fault; no expected outcome was learned from the broken implementation.

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
	"candidate": "daedab67da5907c25ffc39718dba485e94045ac059abc7d94ccae7261d3ae0c1",
	"browser": "Google Chrome for Testing 154.0.8037.57",
	"pilot": "pilot-1790482487192.json",
	"status": "PASS",
	"steps": 48,
	"claims": [
		{
			"step": 6,
			"recordedAt": "2026-09-27T04:09:45.120Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "daedab67da5907c25ffc39718dba485e94045ac059abc7d94ccae7261d3ae0c1",
			"session": "a65bb406-72b0-462a-b60a-d40bbb4469f1",
			"origin": "http://127.0.0.1:35387",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "fb26bed5-7637-43fa-9956-6d5821bd96d8",
							"name": "Saved 7ee2d4b1-79a1-465c-8497-025b9419d74a",
							"organization_id": "5aeb9838-7b61-4ac1-92d0-1b009f52de7e"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "fb26bed5-7637-43fa-9956-6d5821bd96d8",
					"observed": true
				}
			]
		},
		{
			"step": 7,
			"recordedAt": "2026-09-27T04:09:48.093Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "daedab67da5907c25ffc39718dba485e94045ac059abc7d94ccae7261d3ae0c1",
			"session": "a65bb406-72b0-462a-b60a-d40bbb4469f1",
			"origin": "http://127.0.0.1:35387",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "5aeb9838-7b61-4ac1-92d0-1b009f52de7e",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "edf323bb-b2d9-40c4-8dd8-87dd080a6326",
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
			"recordedAt": "2026-09-27T04:09:50.807Z",
			"claim": "personnel-scope",
			"status": "PASS",
			"mutation": null,
			"artifact": "daedab67da5907c25ffc39718dba485e94045ac059abc7d94ccae7261d3ae0c1",
			"session": "a65bb406-72b0-462a-b60a-d40bbb4469f1",
			"origin": "http://127.0.0.1:35387",
			"observations": [
				{
					"expectedVisible": ["Able, Synthetic"],
					"expectedHidden": ["Baker, Synthetic", "Unassigned, Synthetic", "Foreign, Synthetic"],
					"observed": true
				},
				{
					"expectedIds": ["cadd1071-19f7-44ae-9bba-eaa5dacd92bf"],
					"status": 200,
					"observedIds": ["cadd1071-19f7-44ae-9bba-eaa5dacd92bf"],
					"observed": true
				}
			]
		},
		{
			"step": 21,
			"recordedAt": "2026-09-27T04:11:01.238Z",
			"claim": "group-persistence",
			"status": "FAIL",
			"mutation": "persistence",
			"artifact": "9a8528225bcec1122f0b65c3b68ab7530677b2b1b2babdd91108903d886ab3e2",
			"session": "81a5c0ca-7212-4f48-a775-6537b1acac6d",
			"origin": "http://127.0.0.1:45747",
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
			"recordedAt": "2026-09-27T04:12:06.126Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "daedab67da5907c25ffc39718dba485e94045ac059abc7d94ccae7261d3ae0c1",
			"session": "46aa4f60-8bc6-4cd9-82d8-49b1f474e418",
			"origin": "http://127.0.0.1:34669",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "95f2ee69-ba7e-44be-a15c-1dc2a3ec2795",
							"name": "Saved de4244fd-c11f-4567-b88b-dd2a852962b6",
							"organization_id": "2cbaf689-42f0-4a4f-a3e2-7ead3d105851"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "95f2ee69-ba7e-44be-a15c-1dc2a3ec2795",
					"observed": true
				}
			]
		},
		{
			"step": 31,
			"recordedAt": "2026-09-27T04:13:12.430Z",
			"claim": "group-authorization",
			"status": "FAIL",
			"mutation": "authorization",
			"artifact": "63f4fb9e2c1cf1e8908516c085a8027dfcc8d42433aee156492ae9f78e8017f2",
			"session": "5103eac7-2f4a-4f8a-805d-d1220dd31f6b",
			"origin": "http://127.0.0.1:36145",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "bf8ab253-e329-497f-bd16-d2f6ec04b7dc",
					"response": {
						"status": 200
					},
					"savedRows": [
						{
							"id": "71202d46-2f03-4426-b1d1-bfab96a0756f",
							"organization_id": "bf8ab253-e329-497f-bd16-d2f6ec04b7dc"
						}
					],
					"observed": false
				}
			]
		},
		{
			"step": 35,
			"recordedAt": "2026-09-27T04:14:15.981Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "daedab67da5907c25ffc39718dba485e94045ac059abc7d94ccae7261d3ae0c1",
			"session": "6f05f99e-5c2e-40db-bf1e-3f81a4202260",
			"origin": "http://127.0.0.1:33775",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "4241eb74-f27e-4f4e-9142-78b2b469c3c6",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "8f2115c5-5a6b-4dcf-9150-931b7e6df243",
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

## Browser health and navigation refusal

The reported failures were reproduced on `3c59ae2d`: stopping only the owned DevTools process left doctor at `PASS`/exit 0 while `list_pages` failed, and external navigation returned refusal text with exit 0. The repaired shared call path refuses URLs outside the exact owned app/provider origins before DevTools dispatch; native browser allowlists remain in place. Doctor probes the owned login endpoint and native `list_pages`, each with a five-second timeout.

The final pilot checks command exit codes as well as structured results:

| Control                                                          | Observed result                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| External `navigate_page` and `new_page`                          | `BLOCKED / URL_NOT_OWNED`, exit 2                                             |
| Same-origin credential-bearing URL, with omitted navigation type | `BLOCKED / URL_NOT_OWNED`, exit 2                                             |
| Owned app URL                                                    | Navigation succeeds, exit 0                                                   |
| External navigation through the registered MCP proxy             | `isError: true`, structured `BLOCKED / URL_NOT_OWNED`                         |
| Owned app process alive but suspended                            | Doctor `INCONCLUSIVE / APP_ENDPOINT_UNAVAILABLE`, exit 2                      |
| Same app resumed                                                 | Doctor `PASS`, exit 0                                                         |
| Only owned DevTools process stopped                              | Doctor `INCONCLUSIVE / DEVTOOLS_UNAVAILABLE`, exit 2; `list_pages` also fails |

The endpoint control resumes the verified owned app in a `finally` block; all controls use exact recorded process identities. The pilot's cleanup and the separate coverage session both passed. Baseline observations remain in `.verification/evidence/browser-review-baseline.json`; current results are in the pilot identified above. Independent review found no blocking issue.

## Additional capability and refusal evidence

- A second worker ran concurrently with the first using its own app port, profile, Supabase project, accounts, and mutable data. After the exclusive-pilot repair, an active pilot blocked another worker's launch (`PILOT_BUSY`), an occupied worker blocked the pilot (`WORKER_BUSY`), and a verified dead pilot owner was recovered without deleting a live marker. Native MCP stdio registration listed 30 tools and drove `list_pages` successfully. The browser stayed alive between commands.
- Native accessibility/DOM snapshot, console inspection, request inspection, screenshot, and performance trace capture worked. The trace smoke reported LCP 326 ms and CLS 0; this is capability evidence, not a reproducible performance claim. The reviewed [synthetic Personnel screenshot](evidence/personnel-healthy.png) shows the retained application at the same base app revision; it predates the final toolkit hardening.
- Hiding installed Chromium from PATH exercised automatic Chrome for Testing download and installation. Missing `unzip` first returned `BLOCKED`; successful provisioning used temporary staging and an atomic cache install. No personal browser profile was accessed.
- Killing only an identified owned supervisor caused doctor and drive to refuse; cleanup removed its exact remaining resources. Cleanup during startup cancelled only the owned detached process group and provider. Empty unused worker allocations can be recovered; nonempty unmarked directories are refused.
- Provider-marker substitution was rejected before provider access. Restoring the owned marker allowed exact cleanup. The initial long project-ID truncation discovered during the pilot was repaired with IDs below Supabase's limit, and the two affected toolkit-created projects were positively identified and removed.

Local raw receipts remain under `.verification/evidence/` after cleanup. The previous healthy persistence receipt still passed `check-receipt` after its worker was removed. Private session files and keys are outside the checkout and are not published. The durable results above preserve synthetic observations without credentials, tokens, or raw network bodies.

## Repository checks and review

Local formatting, focused ESLint, Markdown links, whitespace checks, Svelte/type checking (zero errors and warnings), eight existing CI-runner safety tests, and the subprocess completion/error and forced-exit tests passed. Skill metadata validation passed for both project skills. The full repository/application and disposable database checks ran successfully in preliminary Depot runs.

The executable candidate is reproduced with `npm run --silent verify:app -- info` (the `candidate` field). This content hash is the same identifier sealed into the receipts; it does not depend on Git's diff algorithm or patch-prefix configuration. Exact-commit hosted checks are tracked on [PR #1385](https://github.com/waffleflopper/trooptotask/pull/1385). The preceding commit `3c59ae2d9b3cd6e8bcf065f0f36e9e337415a511` passed [Depot validation](https://depot.dev/orgs/rvsvvkd4rp/workflows/671zt60bzz). Hosted validation for the doctor/navigation repair is pending at push; the previous run does not approve that changed executable candidate. Merge remains a separate review decision.

- Full repository/application validation includes formatting, lint, governance, Svelte/types, Vitest, Python runner safety tests, documentation checks, and the production build.
- Disposable database validation includes fresh migration replay, SQL contracts, provider probes, and populated upgrades, followed by exact owned-project cleanup.
- The existing optional `@opentelemetry/api`, chunk-size, and mixed-import build warnings remain. No warning was converted into a skipped required check.

The primary independent implementation review used `gpt-6-sol` with `xhigh` effort and focused on ownership, cleanup, evidence integrity, and falsifiable claims. Review repairs cover edited receipts, malformed launch arguments, interrupted startup cleanup, fast child exits, concurrent issuer-key creation, unreadable foreign `/proc` entries, and mixed-candidate pilots. The pilot requires exclusive workers and recovers only a verified dead owner's lock. The final cleanup repair confirms owned MCP/process exit before marking a session cleaned, including forced termination; a stubborn child test exercises the real SIGKILL path. App setup secrets are generated separately from the supervisor control token. No broad style cleanup was added.

The dependency audit introduced no new advisory names compared with the base lockfile: both report the same 17 advisories (2 low, 8 moderate, 6 high, 1 critical). Those existing dependency findings are outside this tooling slice. The three new development dependencies are exact-pinned; no Playwright dependency or tracked browser-spec suite was added.

## Limits and publication boundary

The supervisor currently requires Linux `/proc`, local Docker, Python, and Supabase CLI; it is not a native macOS runner. Chrome provisioning needs network access, `unzip`, and system browser libraries. A fresh agent session may be needed to load project skills/MCP; the CLI works without that reload. No manual setup remains on the verified workstation.

The initial claims do not cover MFA, invitations, recovery, Personnel writes, every permission combination, or other product areas. Local console inspection observed Vercel analytics/speed-insights script 404s, a form-field name/id accessibility issue, and an unused preload warning. Those are recorded observations, not a clean-console assertion or new product repair scope. Missing claims remain `INCONCLUSIVE`; ambiguous future requirements must stay unresolved in the Feature Map.

Publication is limited to one tooling PR. `vercel.json` disables Git deployment for the exact tooling branch because existing branch pushes otherwise create Vercel previews; other branches and hosted settings are unchanged. Depot validates the candidate without deployment. There is no merge, production deployment, phase-issue edit, or next application deliverable in this slice.
