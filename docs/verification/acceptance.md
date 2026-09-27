# Verification toolkit acceptance

This tooling slice starts from D03's merged [PR #1384](https://github.com/waffleflopper/trooptotask/pull/1384), main revision `f03a11236c89e37fe1b020488389177c755c45f5`. [Workflow #1275](https://github.com/waffleflopper/trooptotask/issues/1275) and the stabilization queue remain unchanged. No application source, schema, production provider, existing local database, or authentication behavior was changed.

The installed entry points are [t2t-engineer](../../.agents/skills/t2t-engineer/SKILL.md), [t2t-verify](../../.agents/skills/t2t-verify/SKILL.md), and `npm run verify:app -- --help`. The initial [Feature Map](../../.agents/skills/t2t-verify/references/feature-map.md) covers normal synthetic login, Group creation and persistence, denied Group writes, and both Group-scoped and Organization-wide Personnel reads. The [upstream record](upstreams.md) contains exact versions, licenses, readable article sources, MCP registration, and setup instructions.

## Candidate and environment

The current executable candidate is `dd692bd5263a16490d81ee090aa92f6a9a56ae57fd9b785897ba92052133ac97`, based on the revision above plus this PR's executable changes. The complete pilot and coverage-first baseline below ran on this same candidate. The toolkit hashes tracked and nonignored untracked file contents; Markdown records and dotenv files are excluded. Each drive also checks the private copied source and actual production build. Markdown evidence updates do not silently approve executable changes. Receipts are sealed with a private checkout key; imported or edited receipts cannot become local approval.

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

The baseline extract below is review evidence, not a substitute for its sealed local receipt (`1790480470549-b84cb0d1-11bc-4320-8f39-468208fcf4c5.json`). The machine-readable set outcomes remain in `.verification/evidence/finish-coverage-complete.json`, `finish-missing-receipt.json`, and `finish-calendar-blocked.json` after cleanup.

```json
{
	"candidate": "dd692bd5263a16490d81ee090aa92f6a9a56ae57fd9b785897ba92052133ac97",
	"recordedAt": "2026-09-27T03:41:10.549Z",
	"origin": "http://127.0.0.1:41899",
	"claim": "personnel-organization-scope",
	"status": "PASS",
	"scope": {
		"role": "viewer",
		"organizationId": "4bcff269-a3f7-45b8-81a9-4f2b726f286e",
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
				"9d27d18b-03f7-4e46-9bc1-a9edea0fafff",
				"7f744277-6224-47f9-8c8b-0c56c619761c",
				"533ee2f7-9e9a-4d93-8532-0bd3acc3eb64"
			],
			"status": 200,
			"observedIds": [
				"9d27d18b-03f7-4e46-9bc1-a9edea0fafff",
				"7f744277-6224-47f9-8c8b-0c56c619761c",
				"533ee2f7-9e9a-4d93-8532-0bd3acc3eb64"
			],
			"observed": true
		}
	]
}
```

## Behavioral acceptance

The current full pilot passed all **38 steps** on the candidate above. Every healthy and deliberately broken app compiled and launched in production mode. All five launched providers, apps, and browsers were cleaned up. Each affected claim ran before, during, and after its corresponding fault; no expected outcome was learned from the broken implementation.

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
	"candidate": "dd692bd5263a16490d81ee090aa92f6a9a56ae57fd9b785897ba92052133ac97",
	"browser": "Google Chrome for Testing 154.0.8037.57",
	"pilot": "pilot-1790480416534.json",
	"status": "PASS",
	"steps": 38,
	"claims": [
		{
			"step": 6,
			"recordedAt": "2026-09-27T03:35:25.489Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "dd692bd5263a16490d81ee090aa92f6a9a56ae57fd9b785897ba92052133ac97",
			"session": "866c2a4a-83d5-4e2e-a087-a392d554e06f",
			"origin": "http://127.0.0.1:45539",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "6c31091a-e8c7-4671-a34b-b102e710cfa4",
							"name": "Saved 0a970fce-bc73-4d9c-a075-d13f815c027d",
							"organization_id": "937ba9b7-167f-4618-949d-62b93694367d"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "6c31091a-e8c7-4671-a34b-b102e710cfa4",
					"observed": true
				}
			]
		},
		{
			"step": 7,
			"recordedAt": "2026-09-27T03:35:28.470Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "dd692bd5263a16490d81ee090aa92f6a9a56ae57fd9b785897ba92052133ac97",
			"session": "866c2a4a-83d5-4e2e-a087-a392d554e06f",
			"origin": "http://127.0.0.1:45539",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "937ba9b7-167f-4618-949d-62b93694367d",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "52a8beb3-1c1a-4853-826c-bfc88cd39af3",
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
			"recordedAt": "2026-09-27T03:35:31.222Z",
			"claim": "personnel-scope",
			"status": "PASS",
			"mutation": null,
			"artifact": "dd692bd5263a16490d81ee090aa92f6a9a56ae57fd9b785897ba92052133ac97",
			"session": "866c2a4a-83d5-4e2e-a087-a392d554e06f",
			"origin": "http://127.0.0.1:45539",
			"observations": [
				{
					"expectedVisible": ["Able, Synthetic"],
					"expectedHidden": ["Baker, Synthetic", "Unassigned, Synthetic", "Foreign, Synthetic"],
					"observed": true
				},
				{
					"expectedIds": ["3b9fe2a4-efe1-42ee-9094-78d31a1c24fe"],
					"status": 200,
					"observedIds": ["3b9fe2a4-efe1-42ee-9094-78d31a1c24fe"],
					"observed": true
				}
			]
		},
		{
			"step": 21,
			"recordedAt": "2026-09-27T03:36:41.717Z",
			"claim": "group-persistence",
			"status": "FAIL",
			"mutation": "persistence",
			"artifact": "33134d7e8bd23926b2e5c38df43a3bfbb12856f3a5edf39e0d791a623f2ad806",
			"session": "ffa07dd0-1b0f-47b7-b5cc-4fd5aee76965",
			"origin": "http://127.0.0.1:32889",
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
			"recordedAt": "2026-09-27T03:37:46.982Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "dd692bd5263a16490d81ee090aa92f6a9a56ae57fd9b785897ba92052133ac97",
			"session": "e2c5eb06-436b-44ad-8059-e85658947a67",
			"origin": "http://127.0.0.1:41849",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "37f6694a-ce5e-41cd-89d9-21828ed2e3b1",
							"name": "Saved d0aac7e5-a7c6-4c0c-816d-ac04e287dc2f",
							"organization_id": "88b18499-b407-41d9-b4ad-21e7e5b07ae6"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "37f6694a-ce5e-41cd-89d9-21828ed2e3b1",
					"observed": true
				}
			]
		},
		{
			"step": 31,
			"recordedAt": "2026-09-27T03:38:53.788Z",
			"claim": "group-authorization",
			"status": "FAIL",
			"mutation": "authorization",
			"artifact": "0e883173e3ff96d904202b152be2ded6c597a2d5b70413ed24e4f746864f6421",
			"session": "dc48d193-64db-40a7-9f07-c625fb66ef12",
			"origin": "http://127.0.0.1:36835",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "1e39973f-e57a-44d5-afec-44c3a68987ed",
					"response": {
						"status": 200
					},
					"savedRows": [
						{
							"id": "22f222fb-7a69-4b44-9957-fed55156f377",
							"organization_id": "1e39973f-e57a-44d5-afec-44c3a68987ed"
						}
					],
					"observed": false
				}
			]
		},
		{
			"step": 35,
			"recordedAt": "2026-09-27T03:39:57.772Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "dd692bd5263a16490d81ee090aa92f6a9a56ae57fd9b785897ba92052133ac97",
			"session": "02789b61-8a78-456f-9533-4c4568324d05",
			"origin": "http://127.0.0.1:43595",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "8d4e0520-8466-4a46-b61f-efcf2277bcdc",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "11e8b431-eac9-48e2-a0b5-175ab1236fba",
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

Local formatting, focused ESLint, Markdown links, whitespace checks, Svelte/type checking (zero errors and warnings), eight existing CI-runner safety tests, and the subprocess completion/error and forced-exit tests passed. Skill metadata validation passed for both project skills. The full repository/application and disposable database checks ran successfully in preliminary Depot runs.

The executable candidate is reproduced with `npm run --silent verify:app -- info` (the `candidate` field). This content hash is the same identifier sealed into the receipts; it does not depend on Git's diff algorithm or patch-prefix configuration. Exact-commit hosted checks are tracked on [PR #1385](https://github.com/waffleflopper/trooptotask/pull/1385). The preceding commit `47cb3e7403db2328e918235ddf3360cbe03a8fa9` passed [Depot validation](https://depot.dev/orgs/rvsvvkd4rp/workflows/45hhzzpsjt). Hosted validation for the final cleanup repair is pending at push; the previous run does not approve that changed executable candidate. Merge remains a separate review decision.

- Full repository/application validation includes formatting, lint, governance, Svelte/types, Vitest, Python runner safety tests, documentation checks, and the production build.
- Disposable database validation includes fresh migration replay, SQL contracts, provider probes, and populated upgrades, followed by exact owned-project cleanup.
- The existing optional `@opentelemetry/api`, chunk-size, and mixed-import build warnings remain. No warning was converted into a skipped required check.

The primary independent implementation review used `gpt-6-sol` with `xhigh` effort and focused on ownership, cleanup, evidence integrity, and falsifiable claims. Review repairs cover edited receipts, malformed launch arguments, interrupted startup cleanup, fast child exits, concurrent issuer-key creation, unreadable foreign `/proc` entries, and mixed-candidate pilots. The pilot requires exclusive workers and recovers only a verified dead owner's lock. The final cleanup repair confirms owned MCP/process exit before marking a session cleaned, including forced termination; a stubborn child test exercises the real SIGKILL path. App setup secrets are generated separately from the supervisor control token. No broad style cleanup was added.

The dependency audit introduced no new advisory names compared with the base lockfile: both report the same 17 advisories (2 low, 8 moderate, 6 high, 1 critical). Those existing dependency findings are outside this tooling slice. The three new development dependencies are exact-pinned; no Playwright dependency or tracked browser-spec suite was added.

## Limits and publication boundary

The supervisor currently requires Linux `/proc`, local Docker, Python, and Supabase CLI; it is not a native macOS runner. Chrome provisioning needs network access, `unzip`, and system browser libraries. A fresh agent session may be needed to load project skills/MCP; the CLI works without that reload. No manual setup remains on the verified workstation.

The initial claims do not cover MFA, invitations, recovery, Personnel writes, every permission combination, or other product areas. Local console inspection observed Vercel analytics/speed-insights script 404s, a form-field name/id accessibility issue, and an unused preload warning. Those are recorded observations, not a clean-console assertion or new product repair scope. Missing claims remain `INCONCLUSIVE`; ambiguous future requirements must stay unresolved in the Feature Map.

Publication is limited to one tooling PR. `vercel.json` disables Git deployment for the exact tooling branch because existing branch pushes otherwise create Vercel previews; other branches and hosted settings are unchanged. Depot validates the candidate without deployment. There is no merge, production deployment, phase-issue edit, or next application deliverable in this slice.
