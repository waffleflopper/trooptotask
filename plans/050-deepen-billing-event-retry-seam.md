# Plan 050: Deepen billing-event retry seam

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/routes/admin/billing-events/+page.server.ts src/routes/admin/billing-events/page.server.test.ts src/lib/server/core/useCases/platformBillingEvents.ts src/lib/server/core/useCases/platformBillingEvents.test.ts src/lib/server/adapters/supabasePlatformBillingEvents.ts src/lib/server/adapters/supabasePlatformBillingEvents.test.ts src/lib/server/adapters/inMemoryPlatformBillingEvents.ts src/lib/server/billing/stripeWebhookProcessing.ts docs/architecture/DRIFT_LEDGER.md docs/architecture/adrs/0011-platform-administration-boundary.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 059 governance allowlist for admin-provider routes
- **Category**: architecture
- **Planned at**: commit `9a1e439b`, 2026-06-13 AKDT

## Why this matters

Platform Billing Event diagnostics already read through `PlatformBillingEvents`, but the retry
command still keeps the retry state machine, Stripe event reconstruction, webhook processor calls,
and audit payload assembly inside the SvelteKit route. That leaves a privileged Platform
Administration command coupled to Supabase and Stripe processor details at the route layer. After
this plan, the route should be a thin form-action shell and the retry command should live behind the
same Platform Administration module as the billing-event ledger reads.

## Current state

- `src/routes/admin/billing-events/+page.server.ts:1-12` imports `Stripe`, `SupabaseClient`, and
  private webhook processor helpers directly into the route.
- `src/routes/admin/billing-events/+page.server.ts:21-30` reconstructs a `Stripe.Event` from the
  ledger row inside the route.
- `src/routes/admin/billing-events/+page.server.ts:32-113` owns `_retryBillingEventCore`, including
  retry validation, recording a retry attempt, processing the recorded event, and audit details.
- `src/routes/admin/billing-events/+page.server.ts:61-92` passes
  `ctx.adminClient as SupabaseClient` to `_recordRetryableStripeWebhookEventAttempt` and
  `_processRecordedStripeWebhookEvent`.
- `src/lib/server/core/useCases/platformBillingEvents.ts:58-68` only exposes read methods:
  `listDiagnostics` and `getEventById`.
- `src/lib/server/adapters/supabasePlatformBillingEvents.ts:175-179` wires only the read store.
- `src/routes/admin/billing-events/page.server.test.ts:213-441` tests retry behavior through the
  route core and mocks the webhook processor at the route boundary.
- ADR 0011 says platform-admin routes should compose admin context and use cases; provider-specific
  Platform Administration commands belong behind app-owned modules.

## Commands you will need

| Purpose                 | Command                                                                                                                                                                     | Expected on success |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Install, if needed      | `npm ci`                                                                                                                                                                    | exit 0              |
| Focused route test      | `npx vitest run src/routes/admin/billing-events/page.server.test.ts`                                                                                                        | all pass            |
| Focused use-case tests  | `npx vitest run src/lib/server/core/useCases/platformBillingEvents.test.ts src/lib/server/adapters/supabasePlatformBillingEvents.test.ts`                                   | all pass            |
| Provider-leak grep      | `rg -n -e 'SupabaseClient' -e '_recordRetryableStripeWebhookEventAttempt' -e '_processRecordedStripeWebhookEvent' -e 'ctx\\.adminClient as SupabaseClient' -e 'type Stripe' src/routes/admin/billing-events/+page.server.ts` | no matches          |
| Format                  | `npm run format`                                                                                                                                                           | exit 0              |
| Lint                    | `npm run lint`                                                                                                                                                             | exit 0              |
| Governance              | `npm run governance:check`                                                                                                                                                  | exit 0              |
| Typecheck               | `npm run check`                                                                                                                                                            | exit 0              |
| Full tests              | `npm run test`                                                                                                                                                             | exit 0              |

## Scope

**In scope**:

- `src/lib/server/core/useCases/platformBillingEvents.ts`
- `src/lib/server/core/useCases/platformBillingEvents.test.ts`
- `src/lib/server/adapters/supabasePlatformBillingEvents.ts`
- `src/lib/server/adapters/supabasePlatformBillingEvents.test.ts`
- `src/lib/server/adapters/inMemoryPlatformBillingEvents.ts`
- `src/routes/admin/billing-events/+page.server.ts`
- `src/routes/admin/billing-events/page.server.test.ts`
- `docs/architecture/DRIFT_LEDGER.md`
- `plans/README.md` status row only

**Out of scope**:

- Do not rewrite `handleStripeWebhookPost` or the normal Stripe webhook ingestion path.
- Do not change Stripe event processing semantics, ledger RPC names, or final-state rules.
- Do not add or change database migrations.
- Do not broaden governance automation in this plan. Plan 037 already covered the generic
  route-Supabase scanner blind spot.
- Do not move unrelated billing reconciliation or subscription behavior.

## Git workflow

- Branch: `codex/050-deepen-billing-event-retry-seam`
- Commit style: short imperative subject. Suggested: `Move billing event retries behind platform seam`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the retry command contract in PlatformBillingEvents

Extend `src/lib/server/core/useCases/platformBillingEvents.ts` so `PlatformBillingEvents` exposes a
retry command in addition to the existing diagnostics reads.

Suggested public shape:

```ts
export type PlatformBillingEventRetryResult =
	| { ok: true; state: WebhookProcessingState; result: string }
	| { ok: false; status: number; error: string };

export interface PlatformBillingEventRetryProcessor {
	recordRetryAttempt(event: Stripe.Event, metadata: PlatformBillingEventRetryMetadata): Promise<number>;
	processRecordedEvent(
		event: Stripe.Event,
		metadata: PlatformBillingEventRetryMetadata
	): Promise<RecordedWebhookProcessingResult>;
}

export interface PlatformBillingEvents {
	listDiagnostics(input: { limit: number }): Promise<{ events: BillingEventDiagnostic[]; diagnosticsError: boolean }>;
	getEventById(id: string): Promise<PlatformBillingEventRecord | null>;
	retryEvent(eventId: string): Promise<PlatformBillingEventRetryResult>;
}
```

Keep the exact names flexible if a nearby naming pattern is better, but preserve these boundaries:

- the route must not know how to reconstruct a `Stripe.Event`,
- the route must not call `_recordRetryableStripeWebhookEventAttempt`,
- the route must not call `_processRecordedStripeWebhookEvent`,
- the route must not cast `ctx.adminClient` to `SupabaseClient`,
- audit payload assembly for `admin.billing_event.retry` belongs with the retry command.

Move the current route-local helpers into the use case:

- `normalizeAttemptCount`,
- `stripeEventFromLedgerRow`,
- retryability checks for `retryable_failed` and `processed`.

The retry result contract must preserve the current route behavior:

- empty event id -> `{ ok: false, status: 400, error: 'Missing billing event ID.' }`,
- missing event -> `{ ok: false, status: 404, error: 'Billing event was not found.' }`,
- non-retryable state -> 400 with the same message shape,
- retry-attempt race/no-longer-retryable -> 409 when the error message contains
  `no longer retryable`,
- processor retry failure -> existing status/error mapping,
- successful retry -> `{ ok: true, state, result }`.

**Verify**: focused use-case tests fail before the implementation and pass after it.

### Step 2: Keep webhook processor access in the Supabase adapter

In `src/lib/server/adapters/supabasePlatformBillingEvents.ts`, add the provider-aware retry
processor. This adapter may import from `stripeWebhookProcessing` and may use `ctx.adminClient`.
That is the provider edge.

Suggested adapter shape:

```ts
function createSupabaseBillingEventRetryProcessor(supabase: SupabaseClient): PlatformBillingEventRetryProcessor {
	return {
		recordRetryAttempt(event, metadata) {
			return _recordRetryableStripeWebhookEventAttempt(supabase, event, metadata);
		},
		processRecordedEvent(event, metadata) {
			return _processRecordedStripeWebhookEvent(supabase, event, metadata);
		}
	};
}

export function createSupabasePlatformBillingEvents(ctx: AdminContext): PlatformBillingEvents {
	return createPlatformBillingEvents({
		store: createSupabasePlatformBillingEventsStore(ctx.adminClient),
		retryProcessor: createSupabaseBillingEventRetryProcessor(ctx.adminClient),
		audit: { log: (event) => ctx.audit(event) }
	});
}
```

Keep the adapter's read store behavior unchanged. If TypeScript import cycles appear, stop and
report instead of moving private webhook internals into the route or core module.

**Verify**:
`npx vitest run src/lib/server/adapters/supabasePlatformBillingEvents.test.ts` exits 0.

### Step 3: Update in-memory and core tests

Update `src/lib/server/adapters/inMemoryPlatformBillingEvents.ts` or add a small test-only retry
processor helper so `platformBillingEvents.test.ts` can exercise the retry command without
Supabase.

Move the behavioral retry tests out of `src/routes/admin/billing-events/page.server.test.ts` and
into `src/lib/server/core/useCases/platformBillingEvents.test.ts`. Cover at least:

- success records an audit event with `severity: 'info'`,
- processing failure records `severity: 'warning'`,
- retry-attempt race records `resultState: 'ledger_error'` and returns 409,
- lookup failure returns sanitized 500 and logs the provider error through the use-case error path,
- non-retryable states do not call the retry processor and do not audit success,
- Stripe event reconstruction preserves `id`, `type`, `created`, and `data`.

Use a fake retry processor instead of importing Supabase or the real webhook processor in the core
test.

**Verify**:
`npx vitest run src/lib/server/core/useCases/platformBillingEvents.test.ts` exits 0.

### Step 4: Thin the billing-events route

Update `src/routes/admin/billing-events/+page.server.ts` so the action only parses form data,
delegates to `createSupabasePlatformBillingEvents(ctx).retryEvent(eventId)`, and maps the result to
`fail(...)` or the success payload.

The route should no longer export `_retryBillingEventCore`. If another test needs a core seam, test
the use case instead.

Target action shape:

```ts
const result = await createSupabasePlatformBillingEvents(ctx).retryEvent(eventId);
if (!result.ok) return fail(result.status, { error: result.error, eventId });
return { success: true, eventId, result: result.result, state: result.state };
```

Update `page.server.test.ts` so it mocks `createSupabasePlatformBillingEvents` and asserts:

- `load` calls `listDiagnostics({ limit: 50 })`,
- `retry` calls `retryEvent(eventId)`,
- action failure mapping is unchanged,
- action success mapping is unchanged,
- a throwing `adminClient.from`/`auth` mock does not matter because the route does not touch the
  provider directly.

**Verify**:
`npx vitest run src/routes/admin/billing-events/page.server.test.ts` exits 0.

### Step 5: Update drift documentation

Update `docs/architecture/DRIFT_LEDGER.md` under D-02 so the current-state truth says
Platform Administration billing-event retry commands now route through `PlatformBillingEvents` and
the Supabase adapter instead of route-local webhook processor calls.

Do not mark D-02 resolved. This plan removes one cluster only.

**Verify**:
`npm run governance:check` exits 0.

### Step 6: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Use-case tests own retry state-machine behavior.
- Adapter tests own Supabase/webhook-processor wiring.
- Route tests own form-action result mapping.
- Full repo gate.

## Done criteria

- [ ] `PlatformBillingEvents` exposes a retry command with the current user-facing result contract.
- [ ] Billing-event retry audit details are emitted by the use-case seam after retry outcomes are known.
- [ ] The Supabase adapter is the only PlatformBillingEvents layer that imports webhook processor helpers.
- [ ] `src/routes/admin/billing-events/+page.server.ts` no longer imports `Stripe`, `SupabaseClient`, or private webhook processor helpers.
- [ ] The provider-leak grep in "Commands you will need" returns no matches.
- [ ] D-02 drift documentation mentions the retired retry-command route leak without claiming all provider drift is gone.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 050 is updated.

## STOP conditions

Stop and report back if:

- Moving the retry command requires changing the normal Stripe webhook ingestion path.
- TypeScript cycles force private webhook processing internals into `src/routes/**` or the core use
  case.
- Preserving current retry responses conflicts with the existing webhook processor result contract.
- A database migration appears necessary.

## Maintenance notes

Keep future Platform Billing Event operations behind `PlatformBillingEvents` or another narrow
Platform Administration module. Routes may parse HTTP/form input and map results, but they should
not own webhook ledger state machines.
