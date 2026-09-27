# Verification toolkit acceptance

This tooling slice starts from D03's merged [PR #1384](https://github.com/waffleflopper/trooptotask/pull/1384), main revision `f03a11236c89e37fe1b020488389177c755c45f5`. [Workflow #1275](https://github.com/waffleflopper/trooptotask/issues/1275) and the stabilization queue remain unchanged. No application source, schema, production provider, existing local database, or authentication behavior was changed.

The installed entry points are [t2t-engineer](../../.agents/skills/t2t-engineer/SKILL.md), [t2t-verify](../../.agents/skills/t2t-verify/SKILL.md), and `npm run verify:app -- --help`. The initial [Feature Map](../../.agents/skills/t2t-verify/references/feature-map.md) covers normal synthetic login, Group creation and persistence, denied Group writes, and Group-scoped Personnel reads. The [upstream record](upstreams.md) contains exact versions, licenses, readable article sources, MCP registration, and setup instructions.

## Candidate and environment

The executable candidate is `38fca7dcf91de8268f0c1728df0a0cbee028ac8d603cdce77e9b6553e4ebabd9`, based on the revision above plus this PR's executable changes. The toolkit hashes tracked and nonignored untracked file contents; Markdown records and dotenv files are excluded. Each drive also checks the private copied source and actual production build. Markdown evidence updates do not silently approve executable changes. Receipts are sealed with a private checkout key; imported or edited receipts cannot become local approval.

The pilot runs `node scripts/verification/cli.mjs self-test`, which performs the maintained launch → doctor → real browser drive → observation → proof → cleanup sequence. It uses Node `24.21.0`, npm `11.19.0`, Supabase CLI `2.101.0`, Docker `29.7.2`, Chrome DevTools MCP `1.10.1`, and automatically provisioned Chrome for Testing `154.0.8037.57`. The separate installed-browser smoke used Chromium `152.0.7977.82`. CI selects the repository's pinned npm `11.12.1`.

Each worker composes `scripts/ci/database.py` to start a fresh, seed-disabled local Supabase project with a unique project ID and checked ports in `58000–64999`. It creates two synthetic Organizations, three Groups, four Personnel, and four confirmed users with explicit permissions. Sign-in uses the real form. Production build/preview use only the disposable provider URL and generated local keys, generated setup secrets, the allocated loopback app origin, `NODE_ENV=production`, and empty `PUBLIC_APP_ORIGIN`, `PUBLIC_SITE_URL`, and `APP_PUBLIC_ORIGIN_ALLOWLIST`. Contributor dotenv files and inherited provider secrets are excluded.

## Behavioral acceptance

The final pilot passed all **38 steps** on the candidate above. Every healthy and deliberately broken app compiled and launched in production mode. All five launched providers, apps, and browsers were cleaned up. The same claims ran before, during, and after each fault; no expected outcome was learned from the broken implementation.

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

These machine-readable extracts retain the consequential expected and observed results, candidate, session, origin, and time. They are a durable review record; `check-receipt` consumes the original locally sealed receipts, not these extracted summaries.

```json
{
	"candidate": "38fca7dcf91de8268f0c1728df0a0cbee028ac8d603cdce77e9b6553e4ebabd9",
	"browser": "Google Chrome for Testing 154.0.8037.57",
	"pilot": "pilot-1790474190805.json",
	"status": "PASS",
	"steps": 38,
	"claims": [
		{
			"step": 6,
			"recordedAt": "2026-09-27T01:51:40.065Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "38fca7dcf91de8268f0c1728df0a0cbee028ac8d603cdce77e9b6553e4ebabd9",
			"session": "1e3d1db3-955c-476b-8c26-b97e597c87b5",
			"origin": "http://127.0.0.1:37283",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "7bf96e7f-fa38-4a08-96c8-6d36fc4dec96",
							"name": "Saved 80217aee-d560-4be3-a8b5-945cc92776a9",
							"organization_id": "c9461349-5f6d-426f-a826-4ba650186804"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "7bf96e7f-fa38-4a08-96c8-6d36fc4dec96",
					"observed": true
				}
			]
		},
		{
			"step": 7,
			"recordedAt": "2026-09-27T01:51:43.009Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "38fca7dcf91de8268f0c1728df0a0cbee028ac8d603cdce77e9b6553e4ebabd9",
			"session": "1e3d1db3-955c-476b-8c26-b97e597c87b5",
			"origin": "http://127.0.0.1:37283",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "c9461349-5f6d-426f-a826-4ba650186804",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "48936377-5dbc-4296-b531-6b0b498714aa",
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
			"recordedAt": "2026-09-27T01:51:45.783Z",
			"claim": "personnel-scope",
			"status": "PASS",
			"mutation": null,
			"artifact": "38fca7dcf91de8268f0c1728df0a0cbee028ac8d603cdce77e9b6553e4ebabd9",
			"session": "1e3d1db3-955c-476b-8c26-b97e597c87b5",
			"origin": "http://127.0.0.1:37283",
			"observations": [
				{
					"expected": "Personnel UI contains Able and excludes other Group, unassigned, and foreign Personnel",
					"observed": true
				},
				{
					"expectedIds": ["8dea5179-34fd-43d1-9f51-ae052ba6b326"],
					"status": 200,
					"observedIds": ["8dea5179-34fd-43d1-9f51-ae052ba6b326"],
					"observed": true
				}
			]
		},
		{
			"step": 21,
			"recordedAt": "2026-09-27T01:52:56.629Z",
			"claim": "group-persistence",
			"status": "FAIL",
			"mutation": "persistence",
			"artifact": "d3ff1b76b68935b72fa3c87d16a6bfec4a8df3c431a75e9059954b9ca19cd129",
			"session": "3f26d71b-5acc-445b-9070-f0426f92b8ac",
			"origin": "http://127.0.0.1:34939",
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
			"recordedAt": "2026-09-27T01:54:02.410Z",
			"claim": "group-persistence",
			"status": "PASS",
			"mutation": null,
			"artifact": "38fca7dcf91de8268f0c1728df0a0cbee028ac8d603cdce77e9b6553e4ebabd9",
			"session": "1596a9dd-8ab3-4c9f-9d68-46858b541410",
			"origin": "http://127.0.0.1:34123",
			"observations": [
				{
					"expected": "Exactly one Group saved with the submitted name in Organization A",
					"observedRows": [
						{
							"id": "3d721955-a471-4e9d-87ed-8a7d416b97b6",
							"name": "Saved f4635762-12fd-41de-911f-165b32095bc0",
							"organization_id": "b9a4478c-849c-4381-a69b-142e537fb785"
						}
					],
					"observed": true
				},
				{
					"expected": "Saved Group survives full reload",
					"savedId": "3d721955-a471-4e9d-87ed-8a7d416b97b6",
					"observed": true
				}
			]
		},
		{
			"step": 31,
			"recordedAt": "2026-09-27T01:55:08.545Z",
			"claim": "group-authorization",
			"status": "FAIL",
			"mutation": "authorization",
			"artifact": "d44ad2a26f25a094f1940c2931009db5cdd7d3c966a3330661ad0c3ff67f38b7",
			"session": "71b88e37-1a6e-495c-a232-044b1596ea23",
			"origin": "http://127.0.0.1:35945",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "0d78fbee-5c8b-4279-8f9f-2799c9f1e85e",
					"response": {
						"status": 200
					},
					"savedRows": [
						{
							"id": "be8df24b-1cfe-4cb8-999e-01176db4dc90",
							"organization_id": "0d78fbee-5c8b-4279-8f9f-2799c9f1e85e"
						}
					],
					"observed": false
				}
			]
		},
		{
			"step": 35,
			"recordedAt": "2026-09-27T01:56:12.088Z",
			"claim": "group-authorization",
			"status": "PASS",
			"mutation": null,
			"artifact": "38fca7dcf91de8268f0c1728df0a0cbee028ac8d603cdce77e9b6553e4ebabd9",
			"session": "586449d2-b181-480f-809b-18a481ec82df",
			"origin": "http://127.0.0.1:41615",
			"observations": [
				{
					"expected": "403 and no saved effect",
					"organization": "6f348b8c-e941-48d5-8454-d929f9cf6ead",
					"response": {
						"status": 403
					},
					"savedRows": [],
					"observed": true
				},
				{
					"expected": "Access denied (403/404) and no saved effect",
					"organization": "2ebda2dc-8b95-42d5-b7a1-1135c58f45bc",
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

- A second worker ran concurrently with the first using its own app port, profile, Supabase project, accounts, and mutable data. Native MCP stdio registration listed 30 tools and drove `list_pages` successfully. The browser stayed alive between commands.
- Native accessibility/DOM snapshot, console inspection, request inspection, screenshot, and performance trace capture worked. The trace smoke reported LCP 326 ms and CLS 0; this is capability evidence, not a reproducible performance claim. The reviewed [synthetic Personnel screenshot](evidence/personnel-healthy.png) shows the retained application at the same base app revision; it predates the final toolkit hardening.
- Hiding installed Chromium from PATH exercised automatic Chrome for Testing download and installation. Missing `unzip` first returned `BLOCKED`; successful provisioning used temporary staging and an atomic cache install. No personal browser profile was accessed.
- Killing only an identified owned supervisor caused doctor and drive to refuse; cleanup removed its exact remaining resources. Cleanup during startup cancelled only the owned detached process group and provider. Empty unused worker allocations can be recovered; nonempty unmarked directories are refused.
- Provider-marker substitution was rejected before provider access. Restoring the owned marker allowed exact cleanup. The initial long project-ID truncation discovered during the pilot was repaired with IDs below Supabase's limit, and the two affected toolkit-created projects were positively identified and removed.

Local raw receipts remain under `.verification/evidence/` after cleanup. The final healthy persistence receipt still passed `check-receipt` after its worker was removed. Private session files and keys are outside the checkout and are not published. The durable results above preserve synthetic observations without credentials, tokens, or raw network bodies.

## Repository checks and review

Local formatting, focused ESLint, Markdown links, whitespace checks, Svelte/type checking (zero errors and warnings), eight existing CI-runner safety tests, and two subprocess completion/error tests passed. Skill metadata validation passed for both project skills. The full repository/application and disposable database checks ran successfully in preliminary Depot runs.

Exact-candidate Depot validation passed in [run `sqvh7h59s7`](https://depot.dev/orgs/rvsvvkd4rp/workflows/8x1st130dw), base `f03a11236c89e37fe1b020488389177c755c45f5`, cache patch `patch/f03a11236c89/1fd744d0fa8e543e`. Its executable diff SHA-256 is `6baaf07c50bd17592f79598f3f9c3cfcdbc1424b827474005a54f99d8b7fdb2a`, reproducible with `git diff --binary f03a11236c89e37fe1b020488389177c755c45f5 -- . ':(exclude)*.md' | sha256sum`. Subsequent changes only record this result in Markdown; the executable digest is unchanged. Merge remains a separate review decision.

- Repository/application: format, lint, governance, Svelte/types, **572 Vitest files / 5,118 tests**, and production build passed. Eight Python safety tests and documentation checks passed. Svelte/type diagnostics: zero errors and warnings. Governance preserves the existing 1,292 owned Phase 08 findings without new regression exceptions.
- Disposable database: fresh migration replay, **40 SQL contract/regression runs / 944 assertions**, provider probes, and **nine populated-upgrade runs / 100 assertions** passed. Both exact projects (`t2t-ci-db-aeti36rq` and `t2t-ci-db-8jvf480n`) were stopped and removed by the existing runner.
- Material warnings: CI download caching was unavailable but installation completed; the production build retains the existing optional `@opentelemetry/api`, chunk-size, and mixed-import warnings. No warning was converted into a skipped required check.

The primary independent review used `gpt-6-sol` with `xhigh` effort and focused on ownership, cleanup, evidence integrity, and falsifiable claims. Findings about edited receipts, malformed launch arguments, interrupted startup cleanup, fast child exits, concurrent issuer-key creation, and mixed-candidate pilots were fixed and re-reviewed with no remaining blocker in those paths. No broad style cleanup was added.

The dependency audit introduced no new advisory names compared with the base lockfile: both report the same 17 advisories (2 low, 8 moderate, 6 high, 1 critical). Those existing dependency findings are outside this tooling slice. The three new development dependencies are exact-pinned; no Playwright dependency or tracked browser-spec suite was added.

## Limits and publication boundary

The supervisor currently requires Linux `/proc`, local Docker, Python, and Supabase CLI; it is not a native macOS runner. Chrome provisioning needs network access, `unzip`, and system browser libraries. A fresh agent session may be needed to load project skills/MCP; the CLI works without that reload. No manual setup remains on the verified workstation.

The initial claims do not cover MFA, invitations, recovery, Personnel writes, every permission combination, or other product areas. Local console inspection observed Vercel analytics/speed-insights script 404s, a form-field name/id accessibility issue, and an unused preload warning. Those are recorded observations, not a clean-console assertion or new product repair scope. Missing claims remain `INCONCLUSIVE`; ambiguous future requirements must stay unresolved in the Feature Map.

Publication is limited to one tooling PR. `vercel.json` disables Git deployment for the exact tooling branch because existing branch pushes otherwise create Vercel previews; other branches and hosted settings are unchanged. Depot validates the candidate without deployment. There is no merge, production deployment, phase-issue edit, or next application deliverable in this slice.
