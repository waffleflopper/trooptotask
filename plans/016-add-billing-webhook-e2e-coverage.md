# Plan 016: Add end-to-end coverage for the Stripe webhook ingestion path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22e6e184..HEAD -- e2e src/routes/api/webhooks/stripe src/lib/server/billing src/lib/server/stripe.ts package.json`
> If any in-scope or referenced file changed since this plan was written,
> compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (013 recommended first so the runner is patched)
- **Category**: tests
- **Planned at**: commit `22e6e184`, 2026-06-11

## Why this matters

Billing is the revenue path, and its server logic is well unit-tested
(`src/routes/api/webhooks/stripe/server.test.ts` is 1,740 lines), but **nothing exercises the
real HTTP chain**: a signed Stripe webhook hitting the running app, surviving signature
verification against the configured secret, being recorded and processed, and changing
database state. The 12 existing Playwright specs cover auth, calendar, personnel, onboarding —
none touch billing. A regression in the route wiring, the signature plumbing
(`src/lib/server/stripe.ts:234`), env handling, or event recording would today be invisible
until a production webhook failed. This plan adds a small, isolated E2E suite that replays
**self-signed test events** against the dev server — no live Stripe account, no network calls
to Stripe.

This is deliberately scoped to webhook ingestion. Real checkout (creating a Stripe Checkout
Session) requires a live test-mode Stripe key and is NOT covered here (see Maintenance notes).

## Current state

- `src/routes/api/webhooks/stripe/+server.ts` — the entire route (4 lines):

```ts
import type { RequestHandler } from './$types';
import { handleStripeWebhookPost } from '$lib/server/billing/stripeWebhookProcessing';

export const POST: RequestHandler = async ({ request }) => handleStripeWebhookPost(request);
```

- `src/lib/server/billing/stripeWebhookProcessing.ts` (670 lines) — `handleStripeWebhookPost`
  (line 615) verifies the signature, records the event (the `stripe_webhook_events` table is
  RLS-enabled and used for idempotency/dedupe — see `_recordStripeWebhookEventAttempt`,
  line 467), and dispatches via `_processWebhookEvent` (line 433). It operates on the event
  payload + database; the advisor found no outbound Stripe API calls in this module.
- `src/lib/server/stripe.ts:234` — signature verification:
  `return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);`
  with `STRIPE_WEBHOOK_SECRET` from `$env/static/private`. Any value we set in the dev server's
  env is the secret events must be signed with. The Stripe SDK (`stripe` is a prod dependency,
  v22) provides `stripe.webhooks.generateTestHeaderString({ payload, secret })` to produce a
  valid `stripe-signature` header in tests.
- Billing feature gating: `src/lib/config/billing.ts` —
  `export const isBillingEnabled = PUBLIC_BILLING_ENABLED === 'true';` (a `$env/static/public`
  var). The webhook route itself does NOT check `isBillingEnabled` (see the 4-line route), so
  webhook E2E may not even need billing enabled — verify in Step 1; prefer leaving
  `PUBLIC_BILLING_ENABLED` unset if the flow works without it, because enabling billing
  globally changes tier/read-only behavior for every other spec.
- E2E harness: `e2e/playwright.config.ts` — testDir `./specs`, single worker, `globalSetup`
  `./global-setup.ts`, and a `webServer` block that runs `npm run dev` on port 4173 with env
  `{ APP_PUBLIC_ORIGIN, E2E_TESTING: 'true', MAILPIT_URL }`. Fixtures in `e2e/fixtures/`
  (`auth.ts` provides `ownerPage`/`orgId` fixtures; `supabase.ts` provides DB access;
  `test-data.ts` seeds). Page objects in `e2e/pages/`. Exemplar spec: `e2e/specs/calendar.spec.ts`
  (imports `test, expect` from `../fixtures/auth`).
- npm scripts (`package.json:21-25`): `test:e2e` runs
  `playwright test --config=e2e/playwright.config.ts`; per-area scripts like `test:e2e:auth`
  pass a spec path. Note `e2e/specs/*.spec.ts` all run under the ONE config — a new spec file
  there runs in everyone's `npm run test:e2e`.
- Event payload shapes: copy from the fixtures/builders inside
  `src/routes/api/webhooks/stripe/server.test.ts` — it builds `checkout.session.completed`,
  subscription lifecycle, and invoice events with the exact metadata the processor expects
  (org id, etc.). Do not invent payloads.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Local stack | `supabase status` | running (else `supabase start`) |
| New billing E2E | `npm run test:e2e:billing` (added in Step 4) | exit 0 |
| Existing E2E (regression) | `npm run test:e2e` | exit 0, unchanged spec count |
| Unit tests | `npm run test` | exit 0 |
| Typecheck / lint / governance | `npm run check && npm run lint && npm run governance:check` | exit 0 |

## Suggested executor toolkit

- Read `src/routes/api/webhooks/stripe/server.test.ts` BEFORE writing any payload — it is the
  authoritative catalog of event shapes and expected processing outcomes.
- Read `e2e/fixtures/supabase.ts` to see how existing specs query/seed the database with
  service-role access; use the same mechanism for asserting `stripe_webhook_events` rows.

## Scope

**In scope** (the only files you should create/modify):
- `e2e/specs/billing-webhook.spec.ts` (create)
- `e2e/playwright.billing.config.ts` (create — ONLY if Step 1 shows the webhook path needs env
  the shared config must not carry; otherwise reuse the shared config and skip this file)
- `package.json` (add the `test:e2e:billing` script only)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- `src/` — any production code. If the webhook path can't be exercised without changing app
  code, that's a STOP condition, not an invitation.
- `e2e/playwright.config.ts` and existing specs/fixtures — do not add billing env vars to the
  shared `webServer.env`; that changes app behavior for every spec.
- Real Stripe checkout flows, the billing UI pages, customer portal — explicitly deferred.
- CI workflow files (`.github/workflows/`) — automatic triggers are intentionally disabled.

## Git workflow

- Branch: `advisor/016-billing-webhook-e2e`
- Commit style: short imperative subject. Suggested: `Add Stripe webhook E2E coverage`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Establish what env the webhook path needs

Trace `handleStripeWebhookPost` → `src/lib/server/stripe.ts` and answer:
(a) does signature verification work with only `STRIPE_WEBHOOK_SECRET` set (no
`STRIPE_SECRET_KEY`)? Check how the `stripe` client in `src/lib/server/stripe.ts` is constructed
— `constructEvent` is cryptographic and needs no API key, but the module-level client
construction might throw if `STRIPE_SECRET_KEY` is absent; if so, a placeholder test-mode-shaped
dummy value is acceptable for the dev server env.
(b) does event PROCESSING for your chosen event types make any outbound Stripe API call?
(`grep -n "stripe\." src/lib/server/billing/stripeWebhookProcessing.ts` and follow any helper
imports.) If yes for all event types → STOP condition.

**Verify**: write the answers as a comment block at the top of the new spec file (this step's
artifact), including which env vars the chosen config will set.

### Step 2: Decide config strategy

- If the webhook path works under the existing shared `webServer` env (plus at most
  `STRIPE_WEBHOOK_SECRET` — which the shared config does not set): create
  `e2e/playwright.billing.config.ts` as a copy of the shared config with `testDir: './specs'`,
  `testMatch: 'billing-webhook.spec.ts'`, and a `webServer.env` extended with
  `STRIPE_WEBHOOK_SECRET: 'whsec_e2e_placeholder'` (a placeholder, not a real credential) and —
  only if Step 1(a) demands it — a dummy `STRIPE_SECRET_KEY`. Keeping it in a separate config
  guarantees the shared run's env is untouched.
- Keep `PUBLIC_BILLING_ENABLED` unset unless Step 1 proves the webhook route requires it.

**Verify**: `npx playwright test --config=e2e/playwright.billing.config.ts --list` → lists the
new spec (after Step 3 creates it) and ONLY that spec.

### Step 3: Write the spec

Create `e2e/specs/billing-webhook.spec.ts` (model imports/fixtures on
`e2e/specs/calendar.spec.ts`; if the file must not run under the shared config, confirm the
shared config's testMatch doesn't pick it up — if the shared config matches all specs, name the
file so your billing config still finds it but document in the spec header that the shared run
also executing it must remain green, and ensure tests `test.skip()` when
`STRIPE_WEBHOOK_SECRET` plumbing is absent by probing the first response).

Tests, using `request` (Playwright APIRequestContext) against the dev server:

1. **Rejects an unsigned POST** — POST a valid-shaped payload to `/api/webhooks/stripe` with no
   `stripe-signature` header → expect 400.
2. **Rejects a wrongly-signed POST** — sign with a different secret via
   `stripe.webhooks.generateTestHeaderString` (import `stripe` directly in the spec; it's a
   dependency) → expect 400.
3. **Accepts and records a correctly-signed event** — build the simplest event the processor
   fully handles from payload shapes in `server.test.ts` (prefer one that needs no live Stripe
   call per Step 1b), sign with the config's placeholder secret, POST → expect 2xx; then assert
   via the `e2e/fixtures/supabase.ts` mechanism that a `stripe_webhook_events` row exists for
   the event id.
4. **Replay is idempotent** — POST the identical signed event again → expect 2xx and assert no
   duplicate processing (row count for that event id unchanged, or the dedupe outcome that
   `server.test.ts` documents for replays).

**Verify**: `npx playwright test --config=e2e/playwright.billing.config.ts` → 4 tests pass.

### Step 4: Add the npm script and confirm isolation

Add to `package.json` scripts (alongside `test:e2e:auth`):

```json
"test:e2e:billing": "playwright test --config=e2e/playwright.billing.config.ts"
```

(If Step 2 reused the shared config, point at it with the spec path instead, matching the
`test:e2e:auth` pattern.)

**Verify**: `npm run test:e2e:billing` → exit 0; then `npm run test:e2e` → exit 0 with the
existing suite unaffected (no new env leaked into it; if the new spec also runs there, it must
pass or self-skip cleanly).

### Step 5: Full gate

**Verify**: `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` → all exit 0.

## Test plan

The four E2E tests in Step 3 ARE the deliverable: signature rejection (×2), signed-event
acceptance + persistence, and idempotent replay. Structural pattern:
`e2e/specs/calendar.spec.ts` for fixtures, `server.test.ts` for payloads.
Verification: `npm run test:e2e:billing` → 4 passing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `e2e/specs/billing-webhook.spec.ts` exists with 4 tests
- [ ] `npm run test:e2e:billing` exits 0
- [ ] `npm run test:e2e` exits 0 (existing suite unaffected)
- [ ] `npm run test` and `npm run check` exit 0
- [ ] No real Stripe key or secret value appears anywhere in the diff (`git diff | grep -E "sk_live|whsec_[A-Za-z0-9]{20,}|sk_test_[A-Za-z0-9]{20,}"` → no matches)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 016 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1(b) shows every processable event type requires an outbound Stripe API call — report
  which helper makes the call; the plan needs rescoping, not a mock injected into prod code.
- The dev server fails to boot with the placeholder Stripe env (module-level construction
  throws despite Step 1's analysis) — report the throwing module; do not edit it.
- Webhook POSTs are blocked by the rate limiter or another hook before reaching the route —
  report; do not add bypasses to `src/hooks.server.ts`.
- Asserting `stripe_webhook_events` via the supabase fixture hits RLS that service-role access
  doesn't bypass — report the policy.
- The signed event is accepted (2xx) but no row is recorded — that's a real finding about the
  recording path; report it instead of weakening the assertion to "2xx only".

## Maintenance notes

- Deliberately deferred: real Checkout Session E2E (needs live test-mode `STRIPE_SECRET_KEY`
  and price IDs — an operator decision about credentials in the test env), customer-portal
  flow, and billing UI page coverage. If those land later, extend the billing config rather
  than the shared one.
- If `STRIPE_WEBHOOK_SECRET` handling moves out of `$env/static/private` (e.g. to dynamic env),
  the webServer env plumbing here must be revisited.
- Reviewer should scrutinize: the spec signs payloads itself (no recorded fixtures with real
  signatures), placeholder secrets are obviously fake, and the shared Playwright config diff is
  empty.
