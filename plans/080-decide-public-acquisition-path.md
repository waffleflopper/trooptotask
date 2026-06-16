# Plan 080: Decide and document the public acquisition path for paid launch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This is a design/spike plan with a decision gate: do not implement
> self-service signup or checkout unless Robert explicitly chooses that path and
> the follow-up implementation scope is written. When done, update the status
> row for this plan in `plans/README.md` unless a reviewer dispatched you and
> told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 03af64cb..HEAD -- CONTEXT.md docs/architecture/adrs/0009-beta-access-request-account-setup-links.md docs/architecture/ADR_INDEX.md src/routes/auth/request-access src/routes/auth/login/+page.svelte src/routes/api/access-requests/+server.ts src/routes/org/new src/routes/+page.svelte src/lib/components/public e2e/specs/access-request-auth.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 079
- **Category**: direction
- **Planned at**: commit `03af64cb`, 2026-06-15

## Why this matters

Turning on billing does not by itself define how new customers enter
TroopToTask. The current product has a reviewed beta Access Request path,
app-owned Account Setup Links, and authenticated Organization creation, but no
public self-service signup/checkout path. That may be exactly right for a paid
reviewed launch, but it should be an explicit decision before public copy,
support expectations, and billing operations are finalized.

## Current state

- `CONTEXT.md` defines **Access Request** as a beta-period request and warns it
  should not become a permanent parallel registration system.
- ADR 0009 says Access Requests exist for beta-period platform access control
  and cost control, and completing setup creates only a User Account, not an
  Organization Membership.
- `/auth/request-access` copy says "Request access to the beta" and "Beta
  access only."
- Public nav and landing CTAs route unauthenticated users to
  `/auth/request-access`.
- `/org/new` lets an already-authenticated user create an Organization and seed
  default groups/statuses/assignments/holidays.

Current excerpts:

```md
CONTEXT.md
Access Request:
A beta-period request for reviewed entry into TroopToTask before a User Account
is activated.
```

```svelte
src/routes/auth/request-access/+page.svelte
eyebrow="Beta Access"
title="Request access to the beta."
supportTitle="Beta access only."
```

```ts
src/routes/org/new/+page.server.ts
if (!locals.user) throw redirect(303, '/auth/login');
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Svelte docs | Svelte MCP `list-sections`, then `get-documentation` for relevant Svelte/SvelteKit sections | docs read before editing `.svelte` files |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Access request E2E | `npm run test:e2e:access-requests` | all pass |
| Auth E2E | `npm run test:e2e:auth` | all pass |
| Public/auth tests | run touched route/component Vitest tests | all pass |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- `docs/launch-acquisition-path.md` (create)
- `CONTEXT.md` only if the meaning of Access Request changes
- A new ADR or ADR update only if the decision changes ADR 0009 semantics
- `src/routes/auth/request-access/+page.svelte`
- `src/routes/auth/login/+page.svelte`
- `src/routes/+page.svelte`
- `src/lib/components/public/PublicSiteNav.svelte`
- `src/lib/components/public/PublicFooter.svelte`
- `src/lib/components/public/PublicCta.svelte`
- Access request/auth tests that assert changed copy or behavior
- Follow-up plan files only if Robert chooses self-service and the scope needs
  to be broken down
- `plans/README.md` status row only

**Out of scope**:

- Do not implement a full self-service signup, trial, or checkout funnel in this
  plan.
- Do not weaken account setup token security.
- Do not create Organization Members from Access Request completion.
- Do not create Supabase User Accounts before setup-token proof and password
  selection.
- Do not change billing checkout logic except through follow-up plans.
- Do not remove the reviewed access queue unless Robert explicitly chooses a
  replacement and the ADR/domain docs are updated.

## Git workflow

- Branch: `codex/080-public-acquisition-path`
- Commit style: short imperative subject, for example
  `Document paid launch acquisition path`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 0: Get the acquisition decision from Robert

Ask Robert to choose one launch path:

1. **Reviewed paid launch** (recommended default): keep `/auth/request-access`
   as the public entry point, but rename it away from "beta" toward reviewed
   access, early access, or request access. Robert/admins approve accounts, then
   owners create Organizations and billing starts from the app.
2. **Self-service signup/checkout**: public users can create accounts and start
   checkout without manual review. This is larger because it changes abuse,
   onboarding, account creation, billing recovery, and support flows.
3. **Closed beta / no public paid acquisition yet**: billing may be enabled only
   for selected existing orgs, while public copy continues to communicate beta
   access.

If Robert does not choose, STOP and mark the plan BLOCKED. Do not infer.

### Step 1: Create the acquisition decision document

Create `docs/launch-acquisition-path.md` with:

- selected path and date,
- who the path is for,
- what the public CTA says,
- what happens after approval/signup,
- billing entry point,
- support owner/channel,
- anti-abuse/rate-limit expectations,
- follow-up implementation plans if the selected path needs more than copy/docs.

Include a section called "ADR compatibility" that states whether ADR 0009 still
holds. If the selected path contradicts ADR 0009, add or update an ADR instead
of silently drifting domain semantics.

**Verify**:
`rg -n "Selected path|ADR compatibility|billing|support|rate" docs/launch-acquisition-path.md`
shows all required sections.

### Step 2: If reviewed paid launch is selected, update public/auth copy

Keep the route mechanics, but remove stale beta language:

- `/auth/request-access` should describe reviewed access, not "Beta access only".
- `/auth/login` support text should point users without accounts to the chosen
  access path.
- Public nav/footer/landing CTA copy should match plan 079's paid-plan launch
  contract.

Do not change the route path unless Robert explicitly asks for a URL migration.

**Verify**:
`rg -n "Beta Access|beta access|Request access to the beta|Beta request|Request free beta" src/routes src/lib/components/public`
returns no stale copy for reviewed paid launch.

### Step 3: If self-service is selected, write follow-up plans and stop

If Robert chooses self-service, do not implement it here. Create follow-up plan
files after the current highest plan number for at least:

- public account creation and abuse controls,
- self-service Organization creation and first-run onboarding,
- checkout/trial entry and billing recovery before approval,
- support/admin visibility for self-service customers,
- E2E coverage across signup, checkout, first Organization, and cancellation.

Update `plans/README.md` with those follow-up rows and dependencies. Mark this
plan DONE only after the decision doc and follow-up plans exist.

**Verify**:
`rg -n "self-service|signup|checkout|abuse|support" docs/launch-acquisition-path.md plans`
shows the chosen path and follow-up plan coverage.

### Step 4: If closed beta/no public paid acquisition is selected, update docs only

If Robert chooses closed beta, keep beta copy but document that billing is
restricted to selected organizations. Update public copy only where it implies
anyone can immediately buy a paid plan.

**Verify**:
`rg -n "paid plans later|available now|self-service|checkout" src/routes src/lib/components/public docs/launch-acquisition-path.md`
shows no contradiction with closed beta.

### Step 5: Run Svelte and route verification

For any Svelte edits, follow `docs/agents/svelte.md`: use Svelte MCP docs first,
then run `svelte-autofixer` until clean.

**Verify**:

- Svelte autofixer reports no issues/suggestions on edited Svelte files.
- `npm run test:e2e:access-requests` -> all pass if access request behavior or
  copy changed in a way the E2E sees.
- `npm run test:e2e:auth` -> all pass if login/setup copy or flow changed.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Test plan

- If only copy changes, update affected Svelte component tests if they assert
  old text.
- Keep `e2e/specs/access-request-auth.spec.ts` passing for setup-link and
  approval behavior.
- If follow-up plans are created for self-service, their tests belong in those
  plans, not here.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `docs/launch-acquisition-path.md` exists and names exactly one selected
      path.
- [ ] The decision doc states ADR 0009 compatibility.
- [ ] Public/auth copy matches the selected path.
- [ ] If self-service was selected, follow-up plans exist instead of a partial
      implementation.
- [ ] Svelte autofixer is clean for edited Svelte files.
- [ ] Relevant E2E tests either pass or are explicitly reported as unavailable.
- [ ] Required repo checks all pass.
- [ ] `plans/README.md` status row for 080 updated.

## STOP conditions

Stop and report back if:

- Robert has not selected an acquisition path.
- The selected path contradicts ADR 0009 and there is no explicit ADR update.
- Self-service signup appears necessary to complete the request.
- The work would weaken Account Setup Link security or merge beta platform
  access with Organization Membership.
- Svelte MCP docs or autofixer are unavailable for edited Svelte files.

## Maintenance notes

- Reviewed paid launch is the smallest launch-safe path because it preserves
  existing account setup and rate-limit behavior.
- If self-service becomes the target, treat it as a product/program slice, not a
  copy tweak. It needs abuse controls, billing support, onboarding, and E2E
  coverage.
- Keep **Access Request**, **Account Setup Link**, **User Account**, and
  **Organization Membership** separate unless a new ADR says otherwise.
