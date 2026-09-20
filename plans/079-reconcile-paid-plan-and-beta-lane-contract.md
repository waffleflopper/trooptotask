# Plan 079: Reconcile the paid-plan contract and beta-lane launch messaging

Historical implementation record. The [stabilization queue](../docs/stabilization/TODO.md) owns current work; the executor/drift instructions for this completed plan are retired. References below to deleted billing runbooks, plans or code identify historical inputs and do not authorize restoring them. Retained behavior and verification remain governed by the queue. Current acquisition/support guidance is in [Launch Acquisition Path](../docs/launch-acquisition-path.md); external commercial retirement follows [RELEASE](../docs/stabilization/RELEASE.md#commercial-operations-retirement--03-07b-01).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 078
- **Category**: direction
- **Planned at**: commit `03af64cb`, 2026-06-15

## Why this matters

Before paid billing is turned on, public pricing copy, internal tier caps,
Stripe price decisions, feature entitlements, and beta feature labels need to
tell one coherent story. Today the public landing page hardcodes prices and
still says "Free during beta" while the billing checklist says final pricing is
Robert-owned. Duty Rosters and Critical Tasks are also promoted as core
workflows while the app navigation still labels them Beta. A paid launch can
keep beta labels, but the support boundary needs to be explicit.

## Current state

- `src/routes/+page.svelte` hardcodes public plan cards with Free/Team/Unit/
  Enterprise, Team `$5`, Unit `$12`, and "Free during beta" launch copy.
- `src/lib/types/subscription.ts` defines `TIER_CONFIG` with the same cents
  amounts and caps, but it also has an unused `featureKeys` array where Unit
  lists `experimental.ai.chat`.
- `src/lib/server/core/useCases/planPolicy.ts` defines actual plan
  entitlements as `bulk_export_unlimited` and `advanced_reporting`, both Unit.
- `docs/billing-operations-launch-checklist.md` says final Team/Unit prices,
  live price IDs, tax setup, and support process require Robert confirmation.
- `src/lib/components/orgNavigation.ts` marks `Duty Rosters` and
  `Critical Tasks` with `badgeLabel: 'Beta'`.

Current excerpts:

```ts
// src/routes/+page.svelte
const plans = [
	{ name: 'Team', price: '$5', capacity: 'Up to 80 personnel' },
	{ name: 'Unit', price: '$12', capacity: 'Up to 500 personnel' }
];
```

```svelte
src/routes/+page.svelte
<span>Free during beta</span>
... All plans are free during beta. Paid tiers later scale by personnel capacity ...
<div class="cta-final__meta">Free during beta / Paid plans later</div>
```

```ts
// src/lib/types/subscription.ts
unit: {
	name: 'Unit',
	personnelCap: 500,
	priceMonthly: 1200, // cents
	featureKeys: ['experimental.ai.chat']
}
```

```ts
// src/lib/components/orgNavigation.ts
{
	id: 'duty-rosters',
	label: 'Duty Rosters',
	badgeLabel: 'Beta'
}
```

## Commands you will need

| Purpose                      | Command                                                                                                                                                                                                           | Expected on success                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Svelte docs                  | Svelte MCP `list-sections`, then `get-documentation` for relevant Svelte/SvelteKit sections                                                                                                                       | docs read before editing `.svelte` files |
| Svelte autofix               | `svelte-autofixer` on edited Svelte files                                                                                                                                                                         | no issues or suggestions remain          |
| Subscription/plan tests      | `npx vitest run src/lib/server/core/useCases/planPolicy.test.ts src/lib/server/core/useCases/planPolicyGates.test.ts src/routes/org/[orgId]/billing/page.server.test.ts src/lib/components/orgNavigation.test.ts` | all pass                                 |
| Public route/component tests | run any existing tests touched by changed public components                                                                                                                                                       | all pass                                 |
| Full repo gate               | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test`                                                                                                                     | all exit 0                               |

## Scope

**In scope**:

- `src/lib/types/subscription.ts`
- A new client-safe plan presentation helper if needed, preferably near
  subscription types and not in `src/lib/server/**`
- `src/routes/+page.svelte`
- `src/lib/components/public/PublicCta.svelte`
- `src/lib/components/public/PublicSiteNav.svelte`
- `src/lib/components/public/PublicFooter.svelte`
- `src/lib/components/orgNavigation.ts`
- `src/lib/components/orgNavigation.test.ts`
- `src/lib/server/core/useCases/planPolicy.ts` only if the paid entitlement
  contract changes
- Tests for changed tier/plan/nav behavior
- Billing launch docs if pricing/beta decisions need to be recorded
- `plans/README.md` status row only

**Out of scope**:

- No Stripe Dashboard changes.
- No production env-var changes.
- No new product features such as AI chat, trials, coupons, enterprise invoicing,
  discounts, metered usage, or multi-currency.
- No redesign of the public landing page beyond launch contract/copy changes.
- No changes to billing webhook lifecycle semantics. Those were hardened in
  earlier billing plans.

## Git workflow

- Branch: `codex/079-paid-plan-contract`
- Commit style: short imperative subject, for example
  `Align paid plan launch contract`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 0: Get the launch contract decisions from Robert

Ask Robert for these decisions before editing:

1. Final public monthly prices for Team and Unit, or confirmation that the
   existing `$5`/`$12` amounts are final.
2. Whether launch copy should say paid billing is available now, still "free
   during beta", or "request reviewed access".
3. Whether Duty Rosters and Critical Tasks should keep a visible Beta badge for
   paid launch.
4. If Beta badges remain, what they mean: limited support, evolving UX, official
   workflow caution, or another support boundary.
5. Whether Unit-only entitlements are currently only `advanced_reporting` and
   `bulk_export_unlimited`, or whether another real feature should be added to
   the plan policy registry.

If any answer is unavailable, STOP and mark the plan BLOCKED with the missing
decision. Do not guess.

### Step 1: Make tier display data use one client-safe source

Remove the public landing page's standalone `plans` array or make it a thin
projection of a client-safe plan definition. The source should include:

- plan name,
- personnel cap,
- active account user cap,
- export quota/supporting copy,
- monthly price in cents or a contact-sales marker,
- launch-state copy such as beta/free/paid availability.

Prefer extending `src/lib/types/subscription.ts` or adding a small client-safe
helper outside `src/lib/server/**`. Keep server-only Stripe price ID logic in
`src/lib/server/billing/priceCatalog.ts`.

Do not import server modules into Svelte public pages.

**Verify**:
`npm run check` -> exit 0, and `rg -n "price: '\\$5'|price: '\\$12'|Free during beta|Paid plans later" src/routes/+page.svelte src/lib/components/public`
returns only the copy Robert explicitly approved.

### Step 2: Align public launch copy and CTAs

Update public marketing and auth-adjacent copy so it no longer contradicts the
chosen paid launch posture.

Typical reviewed-paid-launch shape:

- Public pricing shows final Team/Unit prices and says access is reviewed, not
  "paid plans later".
- Primary unauthenticated CTA remains `Request Access` until plan 080 changes
  the acquisition model.
- Public footer/nav/access labels match the same route and language.

If Robert chooses self-service signup/checkout instead, STOP after documenting
the copy implications. That is plan 080 territory and should not be quietly
implemented here.

**Verify**:
`rg -n "Free during beta|Paid plans later|beta access|Request free beta" src/routes src/lib/components/public`
returns no stale public launch copy unless Robert explicitly chose to keep it.

### Step 3: Fold in the Beta-lane launch decision

Apply Robert's decision for Duty Rosters and Critical Tasks:

- If the badges are removed, update `src/lib/components/orgNavigation.ts` and
  `src/lib/components/orgNavigation.test.ts` so the nav contract no longer
  expects `badgeLabel: 'Beta'` for those lanes.
- If the badges stay, define the support boundary in a launch-facing place:
  public/pricing copy, a security/terms/support doc, or a concise in-app
  label/description if the existing nav supports it. Do not leave Beta as an
  unexplained paid-launch marker.

Do not change feature permissions for these lanes in this plan.

**Verify**:
`npx vitest run src/lib/components/orgNavigation.test.ts` -> all pass.

### Step 4: Clean up stale or mismatched plan feature keys

Run:

```bash
rg -n "featureKeys|experimental\.ai\.chat|bulk_export_unlimited|advanced_reporting" src docs
```

If `featureKeys` is still unused except for `TIER_CONFIG`, remove it from
`TierConfig` and the tier objects. If Robert confirmed a real feature entitlement
should be added, add it to `PLAN_FEATURE_REGISTRY`, plan availability, upgrade
target logic, admin diagnostics/tests, and downgrade preview tests. Do not add
`experimental.ai.chat` unless a real product surface and enforcement path exist.

**Verify**:
`rg -n "experimental\\.ai\\.chat" src docs` returns no matches unless Robert
explicitly approved that key and the plan policy tests cover it.

### Step 5: Record the contract in billing launch docs

Update `docs/billing-operations-launch-checklist.md` and/or
`docs/billing-launch-verification.md` with the final launch contract:

- final Team and Unit public prices,
- whether automatic tax is disabled or dashboard-verified,
- whether Team/Unit portal switching is enabled,
- what Beta labels mean if retained,
- what remains Robert-owned for live-mode launch.

Do not mark live Dashboard rows Complete unless Robert confirmed them.

**Verify**:
`rg -n "Requires Robert confirmation|Final Team and Unit prices|Beta|Duty Rosters|Critical Tasks" docs/billing-operations-launch-checklist.md docs/billing-launch-verification.md`
shows the intended launch contract and no stale contradiction.

### Step 6: Run Svelte and repo verification

Because this plan edits Svelte files, follow `docs/agents/svelte.md`:

1. Use Svelte MCP `list-sections`.
2. Read relevant documentation with `get-documentation`.
3. Run `svelte-autofixer` on each edited Svelte file until clean.

Then run focused tests and the full gate.

**Verify**:

- Svelte autofixer reports no issues/suggestions on edited Svelte files.
- `npx vitest run src/lib/server/core/useCases/planPolicy.test.ts src/lib/server/core/useCases/planPolicyGates.test.ts src/routes/org/[orgId]/billing/page.server.test.ts src/lib/components/orgNavigation.test.ts` -> all pass.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Test plan

- Add or update tier/plan tests where the contract lives.
- Update `src/lib/components/orgNavigation.test.ts` for the Beta badge decision.
- If public Svelte component tests exist for changed surfaces, update them to
  assert the new paid-launch copy.
- Keep billing lifecycle tests focused on billing behavior; do not make them
  depend on marketing copy.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Robert's launch contract decisions are recorded in the PR/plan notes.
- [ ] Public plan prices and `TIER_CONFIG.priceMonthly` agree.
- [ ] `src/routes/+page.svelte` no longer owns a contradictory hardcoded pricing
      array.
- [ ] `rg -n "Free during beta|Paid plans later|Request free beta" src/routes src/lib/components/public`
      returns no stale copy unless explicitly approved.
- [ ] Duty Roster and Critical Tasks Beta labels are either removed or explained
      in launch-facing support terms.
- [ ] `experimental.ai.chat` is removed or backed by a real, tested entitlement.
- [ ] Svelte autofixer is clean for edited Svelte files.
- [ ] Required repo checks all pass.
- [ ] `plans/README.md` status row for 079 updated.

## STOP conditions

Stop and report back if:

- Robert has not confirmed final pricing or launch copy posture.
- The selected acquisition posture requires self-service signup/checkout work.
  That belongs to plan 080 and likely follow-up plans.
- A feature entitlement change requires new product surfaces or a broad
  permission model redesign.
- Svelte MCP docs or autofixer are unavailable in the executor environment.
- The billing launch rehearsal in plan 078 produced a no-go finding that changes
  the paid plan contract.

## Maintenance notes

- Keep Stripe price IDs and secret values out of client-safe plan display data.
- Future pricing changes should touch one client-safe source plus Stripe/env
  configuration, not a separate landing-page array.
- If Beta labels remain after launch, revisit them during the first paid-user
  feedback cycle so they do not become permanent ambiguity.
