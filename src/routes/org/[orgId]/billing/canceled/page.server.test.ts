import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import { CHECKOUT_ATTEMPTS_TABLE, type CheckoutAttemptRow } from '$lib/server/core/useCases/billingCheckoutAttempts';
import { _loadCanceledCheckoutPageData } from './+page.server';

function seedAttempt(
	ctx: ReturnType<typeof createTestContext>,
	overrides: Partial<CheckoutAttemptRow> = {}
): CheckoutAttemptRow {
	const attempt: CheckoutAttemptRow = {
		id: 'attempt-canceled-return',
		organization_id: ctx.auth.orgId,
		stripe_checkout_session_id: 'cs_cancel',
		stripe_customer_id: 'cus_cancel',
		commercial_plan: 'team',
		stripe_price_id: 'price_team',
		checkout_url: 'https://checkout.test/cancel',
		status: 'in_progress',
		expires_at: '2026-05-24T11:00:00.000Z',
		completed_at: null,
		canceled_at: null,
		created_at: '2026-05-24T09:00:00.000Z',
		updated_at: '2026-05-24T09:00:00.000Z',
		...overrides
	};
	ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [attempt as unknown as Record<string, unknown>]);
	return attempt;
}

describe('billing canceled page server load', () => {
	it('denies non-owner checkout cancellation return loads through billing policy', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin'
			}
		});
		seedAttempt(ctx);

		await expect(
			loadWithContextCore(ctx, {
				policyAction: POLICY_ACTION_CATALOG.organization.accessBilling,
				fn: (loadCtx) =>
					_loadCanceledCheckoutPageData(loadCtx, {
						checkoutAttemptId: 'attempt-canceled-return'
					})
			})
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'Only the organization owner can perform this action' }
		});
	});

	it('keeps checkout cancellation return loads read-only', async () => {
		const ctx = createTestContext();
		seedAttempt(ctx);
		const now = new Date('2026-05-24T10:00:00.000Z');

		await expect(
			_loadCanceledCheckoutPageData(ctx, {
				checkoutAttemptId: 'attempt-canceled-return',
				now
			})
		).resolves.toEqual({ orgId: ctx.auth.orgId });

		await expect(
			ctx.rawStore.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId, {
				id: 'attempt-canceled-return'
			})
		).resolves.toMatchObject({
			status: 'in_progress',
			canceled_at: null
		});
	});

	it('does not overwrite a completed checkout attempt when a stale canceled URL is loaded', async () => {
		const ctx = createTestContext();
		seedAttempt(ctx, {
			status: 'completed',
			completed_at: '2026-05-24T09:30:00.000Z',
			updated_at: '2026-05-24T09:30:00.000Z'
		});

		await _loadCanceledCheckoutPageData(ctx, {
			checkoutAttemptId: 'attempt-canceled-return',
			now: new Date('2026-05-24T10:00:00.000Z')
		});

		await expect(
			ctx.rawStore.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, ctx.auth.orgId, {
				id: 'attempt-canceled-return'
			})
		).resolves.toMatchObject({
			status: 'completed',
			completed_at: '2026-05-24T09:30:00.000Z',
			canceled_at: null
		});
	});

	it('ignores missing checkout attempt ids', async () => {
		const ctx = createTestContext();

		await expect(
			_loadCanceledCheckoutPageData(ctx, {
				checkoutAttemptId: null,
				now: new Date('2026-05-24T10:00:00.000Z')
			})
		).resolves.toEqual({ orgId: ctx.auth.orgId });
	});
});
