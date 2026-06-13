# Plan 032: Disclose performance analytics in the privacy page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a2b09628..HEAD -- src/routes/privacy/+page.svelte src/routes/+layout.svelte src/hooks.server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `a2b09628`, 2026-06-12

## Why this matters

The app loads Vercel Analytics and Speed Insights globally, but the privacy page currently says the
service does not use analytics beacons. Robert clarified the intended product position: site
analytics are collected for performance and service improvement, but TroopToTask is not collecting
analytics data about individual people for profiling or advertising. After this plan, the public
privacy page matches that position.

## Current state

- `src/routes/+layout.svelte:14-18` loads analytics and speed insights:

```ts
void Promise.all([import('@vercel/analytics'), import('@vercel/speed-insights')]).then(
	([{ inject }, { injectSpeedInsights }]) => {
		inject();
		injectSpeedInsights();
	}
);
```

- `src/hooks.server.ts:24` allows Vercel analytics endpoints in CSP:

```ts
script-src ... https://va.vercel-scripts.com ...; connect-src ... https://vitals.vercel-insights.com ...
```

- `src/routes/privacy/+page.svelte:78-83` currently says:

```svelte
<PublicContentSection label="07 // Cookies &amp; Tracking">
	{#snippet title()}Essential only, no surveillance.{/snippet}
	<p>
		We use only essential cookies required for authentication and session management. We do not use tracking cookies,
		analytics beacons, or third-party advertising pixels. We do not participate in cross-site tracking or data broker
		networks.
	</p>
</PublicContentSection>
```

- Robert explicitly said not to plan a GitHub-feedback privacy remediation because the GitHub beta
  mirror is temporary and will go away after beta.

## Commands you will need

| Purpose    | Command                    | Expected on success |
| ---------- | -------------------------- | ------------------- |
| Typecheck  | `npm run check`            | exit 0              |
| Format     | `npm run format`           | exit 0              |
| Lint       | `npm run lint`             | exit 0              |
| Governance | `npm run governance:check` | exit 0              |
| Full tests | `npm run test`             | exit 0              |

## Scope

**In scope**:

- `src/routes/privacy/+page.svelte`
- `plans/README.md` status row only

**Out of scope**:

- Do not remove Vercel Analytics or Speed Insights.
- Do not change CSP.
- Do not change or remove the beta GitHub feedback mirror.
- Do not add a consent-management system in this plan.

## Git workflow

- Branch: `advisor/032-disclose-performance-analytics-in-privacy-page`
- Commit style: short imperative subject. Suggested: `Clarify performance analytics privacy copy`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Update the Cookies & Tracking section

Edit `src/routes/privacy/+page.svelte` section `07 // Cookies & Tracking`.

Target copy should communicate:

- essential cookies are used for authentication/session management,
- aggregate site analytics and performance signals are collected to understand reliability,
  performance, and product health,
- the app does not use third-party advertising pixels,
- the app does not sell analytics data or participate in cross-site tracking/data-broker networks,
- analytics are not used to profile individual people.

Keep the tone consistent with the existing public-content page: concise, plain, confidence-building.

**Verify**: `npm run check` -> exit 0.

### Step 2: Avoid over-promising about "no analytics"

Search the privacy page for `analytics`, `beacons`, and `tracking`. Ensure no remaining sentence
claims analytics beacons are never used.

**Verify**:

```bash
rg -n "analytics beacons|no analytics|do not use.*analytics" src/routes/privacy/+page.svelte
```

Expected: no stale contradiction remains.

### Step 3: Run the full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Done criteria

- [ ] Privacy page discloses aggregate performance/site analytics.
- [ ] Privacy page still says no advertising pixels, no data broker networks, and no person-level
      analytics profiling.
- [ ] Vercel Analytics and Speed Insights remain enabled.
- [ ] GitHub feedback mirroring is untouched.
- [ ] `plans/README.md` status row for 032 is updated.

## STOP conditions

Stop and report back if:

- A legal/privacy policy source of truth exists elsewhere and contradicts this plan.
- The analytics implementation has changed and no longer uses Vercel Analytics/Speed Insights.
- The requested copy would require a consent banner or product decision beyond a privacy-page edit.

## Maintenance notes

When beta feedback is removed, revisit the privacy page for any beta-specific support language.
This plan intentionally covers analytics disclosure only.
