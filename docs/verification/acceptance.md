# Verification toolkit acceptance

This tooling slice starts from D03's merged [PR #1384](https://github.com/waffleflopper/trooptotask/pull/1384), main revision `f03a11236c89e37fe1b020488389177c755c45f5`. [Workflow #1275](https://github.com/waffleflopper/trooptotask/issues/1275) and the stabilization queue remain unchanged. No application source, schema, production provider, existing local database, or authentication behavior was changed.

The installed entry points are [t2t-engineer](../../.agents/skills/t2t-engineer/SKILL.md), [t2t-verify](../../.agents/skills/t2t-verify/SKILL.md), and `npm run verify:app -- --help`. The initial [Feature Map](../../.agents/skills/t2t-verify/references/feature-map.md) covers normal synthetic login, Group creation and persistence, denied Group writes, and both Group-scoped and Organization-wide Personnel reads. The [upstream record](upstreams.md) contains exact versions, licenses, readable article sources, MCP registration, and setup instructions.

## Candidate and environment

The current executable candidate is `f7f4147c807dd4e5aa0878bf2d6673de95dda30e30c19d713ffa8ff414c45394`, based on the revision above plus this PR's executable changes. The complete pilot and coverage-first baseline below ran on this same candidate. The toolkit hashes tracked and nonignored untracked file contents; Markdown records and dotenv files are excluded. Each drive also checks the private copied source and actual production build. Markdown evidence updates do not silently approve executable changes. Receipts are sealed with a private checkout key; imported or edited receipts cannot become local approval.

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

The baseline extract below is review evidence, not a substitute for its sealed local receipt (`1790477222908-f0d1f474-cefc-4a69-b5db-dee38ab9e7e3.json`). The machine-readable set outcomes remain in `.verification/evidence/coverage-complete.json`, `coverage-missing-receipt.json`, and `coverage-calendar-blocked.json` after cleanup.

```json
{
	"candidate": "f7f4147c807dd4e5aa0878bf2d6673de95dda30e30c19d713ffa8ff414c45394",
	"recordedAt": "2026-09-27T02:47:02.908Z",
	"origin": "http://127.0.0.1:43097",
	"claim": "personnel-organization-scope",
	"status": "PASS",
	"scope": {
		"role": "viewer",
		"organizationId": "ff0ef2bc-9000-4d82-b945-d8a5a25ad19b",
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
				"3bc65da9-e3bc-48a8-ba32-c8dd8dc9b854",
				"7f2fcb46-f415-4b53-8df9-aca984d180fa",
				"c8056f18-6e8f-4fca-82ae-613aa2f7c216"
			],
			"status": 200,
			"observedIds": [
				"3bc65da9-e3bc-48a8-ba32-c8dd8dc9b854",
				"7f2fcb46-f415-4b53-8df9-aca984d180fa",
				"c8056f18-6e8f-4fca-82ae-613aa2f7c216"
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
	"candidate": "f7f4147c807dd4e5aa0878bf2d6673de95dda30e30c19d713ffa8ff414c45394",
	"browser": "Google Chrome for Testing 154.0.8037.57",
	"pilot": "pilot-1790477612738.json",
	"status": "PASS",
	"steps": 38,
	"claims": [
		{
			"step": 6,
			"recordedAt": "2026-09-27T02:48:42.921Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "f7f4147c807dd4e5aa0878bf2d6673de95dda30e30c19d713ffa8ff414c45394",
			"session": "58509644-8dfe-4adc-9871-7d44dae94aca",
			"origin": "http://127.0.0.1:38861",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "279dbcdd-5837-4cea-bf5a-e5b67aeaba64",
							"name": "Saved f0e5ae2d-9231-47dc-9f0e-9cb99cc4cc24",
							"organization_id": "a18ec6d2-f07a-4334-9d1a-ae45d0877c78"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "279dbcdd-5837-4cea-bf5a-e5b67aeaba64",
					"observed": true
				}
			]
		},
		{
			"step": 7,
			"recordedAt": "2026-09-27T02:48:45.880Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "f7f4147c807dd4e5aa0878bf2d6673de95dda30e30c19d713ffa8ff414c45394",
			"session": "58509644-8dfe-4adc-9871-7d44dae94aca",
			"origin": "http://127.0.0.1:38861",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "a18ec6d2-f07a-4334-9d1a-ae45d0877c78",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "1dde7ddf-bcdb-4abc-b373-f911a1b15a06",
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
			"recordedAt": "2026-09-27T02:48:48.598Z",
			"claim": "personnel-scope",
			"status": "PASS",
			"mutation": null,
			"artifact": "f7f4147c807dd4e5aa0878bf2d6673de95dda30e30c19d713ffa8ff414c45394",
			"session": "58509644-8dfe-4adc-9871-7d44dae94aca",
			"origin": "http://127.0.0.1:38861",
			"observations": [
				{
					"expectedVisible": ["Able, Synthetic"],
					"expectedHidden": ["Baker, Synthetic", "Unassigned, Synthetic", "Foreign, Synthetic"],
					"observed": true
				},
				{
					"expectedIds": ["34c88ae7-9997-4fc6-a4c7-d4e94878dc88"],
					"status": 200,
					"observedIds": ["34c88ae7-9997-4fc6-a4c7-d4e94878dc88"],
					"observed": true
				}
			]
		},
		{
			"step": 21,
			"recordedAt": "2026-09-27T02:49:58.962Z",
			"claim": "group-persistence",
			"status": "FAIL",
			"mutation": "persistence",
			"artifact": "4ea3f0c083599b23b3b3b83c026111e052afa716e7d468bb326af90b8638bddd",
			"session": "6e233b4d-5d19-45d9-9746-cd67228bd427",
			"origin": "http://127.0.0.1:36667",
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
			"recordedAt": "2026-09-27T02:51:04.392Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "f7f4147c807dd4e5aa0878bf2d6673de95dda30e30c19d713ffa8ff414c45394",
			"session": "8545121b-b59a-47e1-933b-124966022bce",
			"origin": "http://127.0.0.1:36991",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "51c4c715-3f31-4c00-b1ef-abc9e9134bd6",
							"name": "Saved c237b60d-cba1-4acd-b215-fc69fb10847e",
							"organization_id": "62276950-35d7-4fa7-a05a-2388d5a553cf"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "51c4c715-3f31-4c00-b1ef-abc9e9134bd6",
					"observed": true
				}
			]
		},
		{
			"step": 31,
			"recordedAt": "2026-09-27T02:52:10.584Z",
			"claim": "group-authorization",
			"status": "FAIL",
			"mutation": "authorization",
			"artifact": "252782a3778c09263576debee314b32d0ac9d8197d6b06bc0928f9278dbebb57",
			"session": "dc2deb57-9b5d-49b0-b21d-b7677e55332e",
			"origin": "http://127.0.0.1:38825",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "223519f8-f20c-4da5-a09d-12009e30fb63",
					"response": {
						"status": 200
					},
					"savedRows": [
						{
							"id": "5af4949e-3a55-49de-a90b-0d471c1dede7",
							"organization_id": "223519f8-f20c-4da5-a09d-12009e30fb63"
						}
					],
					"observed": false
				}
			]
		},
		{
			"step": 35,
			"recordedAt": "2026-09-27T02:53:14.069Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "f7f4147c807dd4e5aa0878bf2d6673de95dda30e30c19d713ffa8ff414c45394",
			"session": "06374eca-e885-43f9-a4c2-1284f8be3263",
			"origin": "http://127.0.0.1:44797",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "39edc787-de86-4bef-b81b-fbe1d61e4cbd",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "3a96e718-4840-4563-8f0d-8f3306444984",
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

The pre-review candidate passed [Depot run `sqvh7h59s7`](https://depot.dev/orgs/rvsvvkd4rp/workflows/8x1st130dw) on base `f03a11236c89e37fe1b020488389177c755c45f5`. The current executable candidate above has diff SHA-256 `4f17f8821ad54fb5c7eabe881bc1cf488b8aeafc22b2cf798058a2bca163ec95`, reproducible with `git diff --binary f03a11236c89e37fe1b020488389177c755c45f5 -- . ':(exclude)*.md' | sha256sum`. Its current-head hosted results are tracked on [PR #1385](https://github.com/waffleflopper/trooptotask/pull/1385); the prior run does not approve these executable repairs. Merge remains a separate review decision.

- Pre-review repository/application: format, lint, governance, Svelte/types, **572 Vitest files / 5,118 tests**, and production build passed. Eight Python safety tests and documentation checks passed. Svelte/type diagnostics: zero errors and warnings. Governance preserves the existing 1,292 owned Phase 08 findings without new regression exceptions.
- Pre-review disposable database: fresh migration replay, **40 SQL contract/regression runs / 944 assertions**, provider probes, and **nine populated-upgrade runs / 100 assertions** passed. Both exact projects (`t2t-ci-db-aeti36rq` and `t2t-ci-db-8jvf480n`) were stopped and removed by the existing runner.
- Material warnings: CI download caching was unavailable but installation completed; the production build retains the existing optional `@opentelemetry/api`, chunk-size, and mixed-import warnings. No warning was converted into a skipped required check.

The primary independent implementation review used `gpt-6-sol` with `xhigh` effort and focused on ownership, cleanup, evidence integrity, and falsifiable claims. Findings about edited receipts, malformed launch arguments, interrupted startup cleanup, fast child exits, concurrent issuer-key creation, and mixed-candidate pilots were fixed and re-reviewed with no remaining blocker in those paths. No broad style cleanup was added. A later PR review found four valid issues: the pilot coverage wording, early supervisor exit reporting, unreadable `/proc` entries, and exclusive access during the pilot source-change control. Those were repaired; the prior candidate passed the same 38-step pilot and healthy receipt check. A follow-up review then found that an interrupted pilot could leave an orphaned lock. The current source uses a process-owned marker and removes only a verified stale marker. Focused formatting/lint/tests, active-pilot launch refusal, stale-owner recovery, and occupied-worker pilot refusal passed locally. The current coverage-first candidate passed the complete 38-step pilot, the new Organization-wide Personnel baseline, and required-set refusals. Exact-commit hosted checks are recorded on the existing PR; earlier runs do not approve a changed executable candidate.

The dependency audit introduced no new advisory names compared with the base lockfile: both report the same 17 advisories (2 low, 8 moderate, 6 high, 1 critical). Those existing dependency findings are outside this tooling slice. The three new development dependencies are exact-pinned; no Playwright dependency or tracked browser-spec suite was added.

## Limits and publication boundary

The supervisor currently requires Linux `/proc`, local Docker, Python, and Supabase CLI; it is not a native macOS runner. Chrome provisioning needs network access, `unzip`, and system browser libraries. A fresh agent session may be needed to load project skills/MCP; the CLI works without that reload. No manual setup remains on the verified workstation.

The initial claims do not cover MFA, invitations, recovery, Personnel writes, every permission combination, or other product areas. Local console inspection observed Vercel analytics/speed-insights script 404s, a form-field name/id accessibility issue, and an unused preload warning. Those are recorded observations, not a clean-console assertion or new product repair scope. Missing claims remain `INCONCLUSIVE`; ambiguous future requirements must stay unresolved in the Feature Map.

Publication is limited to one tooling PR. `vercel.json` disables Git deployment for the exact tooling branch because existing branch pushes otherwise create Vercel previews; other branches and hosted settings are unchanged. Depot validates the candidate without deployment. There is no merge, production deployment, phase-issue edit, or next application deliverable in this slice.
