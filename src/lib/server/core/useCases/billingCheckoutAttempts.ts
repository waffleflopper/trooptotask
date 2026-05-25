import type { DataStore } from '$lib/server/core/ports';

export const CHECKOUT_ATTEMPTS_TABLE = 'organization_checkout_attempts';

export type CheckoutAttemptStatus = 'in_progress' | 'completed' | 'canceled' | 'expired' | 'failed';

export interface CheckoutAttemptRow {
	id: string;
	organization_id: string;
	stripe_checkout_session_id: string | null;
	stripe_customer_id: string | null;
	commercial_plan: 'team' | 'unit';
	stripe_price_id: string;
	checkout_url: string | null;
	status: CheckoutAttemptStatus;
	expires_at: string | null;
	completed_at: string | null;
	canceled_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateCheckoutAttemptInput {
	orgId: string;
	commercialPlan: 'team' | 'unit';
	stripePriceId: string;
	now: Date;
}

export interface MarkCheckoutAttemptReadyInput {
	orgId: string;
	attemptId: string;
	sessionId: string | null;
	customerId: string;
	checkoutUrl: string;
	expiresAt: string | null;
	now: Date;
}

const ACTIVE_CHECKOUT_ATTEMPT_CONSTRAINT = 'organization_checkout_attempts_active_org_key';
const CHECKOUT_PLACEHOLDER_TTL_MS = 5 * 60 * 1000;

export function appendCheckoutAttemptId(url: string, attemptId: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set('checkout_attempt_id', attemptId);
	return parsed.toString();
}

export function isCheckoutAttemptActive(
	attempt: Pick<CheckoutAttemptRow, 'status' | 'expires_at' | 'checkout_url' | 'created_at'>,
	now: Date
): boolean {
	if (attempt.status !== 'in_progress') return false;
	if (attempt.expires_at) return new Date(attempt.expires_at).getTime() > now.getTime();
	return new Date(attempt.created_at).getTime() + CHECKOUT_PLACEHOLDER_TTL_MS > now.getTime();
}

export async function expireStaleCheckoutAttempts(
	store: DataStore,
	orgId: string,
	now: Date
): Promise<CheckoutAttemptRow[]> {
	const inProgress = await findInProgressCheckoutAttempts(store, orgId);
	const expired = inProgress.filter((attempt) => !isCheckoutAttemptActive(attempt, now));

	for (const attempt of expired) {
		await store.update<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, orgId, attempt.id, {
			status: 'expired',
			updated_at: now.toISOString()
		});
	}

	return expired;
}

export async function findReusableCheckoutAttempt(
	store: DataStore,
	orgId: string,
	stripePriceId: string,
	now: Date
): Promise<CheckoutAttemptRow | null> {
	const inProgress = await findInProgressCheckoutAttempts(store, orgId);
	return (
		inProgress.find(
			(attempt) =>
				isCheckoutAttemptActive(attempt, now) && attempt.stripe_price_id === stripePriceId && !!attempt.checkout_url
		) ?? null
	);
}

export async function findActiveCheckoutAttempt(
	store: DataStore,
	orgId: string,
	now: Date
): Promise<CheckoutAttemptRow | null> {
	const inProgress = await findInProgressCheckoutAttempts(store, orgId);
	return inProgress.find((attempt) => isCheckoutAttemptActive(attempt, now)) ?? null;
}

export async function createCheckoutAttemptPlaceholder(
	store: DataStore,
	input: CreateCheckoutAttemptInput
): Promise<CheckoutAttemptRow> {
	const nowIso = input.now.toISOString();
	const placeholderExpiresAt = new Date(input.now.getTime() + CHECKOUT_PLACEHOLDER_TTL_MS).toISOString();
	return store.insert<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, input.orgId, {
		commercial_plan: input.commercialPlan,
		stripe_price_id: input.stripePriceId,
		status: 'in_progress',
		expires_at: placeholderExpiresAt,
		created_at: nowIso,
		updated_at: nowIso
	});
}

export async function markCheckoutAttemptReady(
	store: DataStore,
	input: MarkCheckoutAttemptReadyInput
): Promise<CheckoutAttemptRow> {
	return store.update<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, input.orgId, input.attemptId, {
		stripe_checkout_session_id: input.sessionId,
		stripe_customer_id: input.customerId,
		checkout_url: input.checkoutUrl,
		expires_at: input.expiresAt,
		status: 'in_progress',
		updated_at: input.now.toISOString()
	});
}

export async function markCheckoutAttemptFailed(
	store: DataStore,
	orgId: string,
	attemptId: string,
	now: Date
): Promise<void> {
	const attempt = await store.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, orgId, {
		id: attemptId,
		status: 'in_progress'
	});
	if (!attempt) return;

	await store.update<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, orgId, attemptId, {
		status: 'failed',
		updated_at: now.toISOString()
	});
}

export async function markCheckoutAttemptCompleted(
	store: DataStore,
	orgId: string,
	attemptId: string,
	now: Date
): Promise<CheckoutAttemptRow | null> {
	const attempt = await store.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, orgId, {
		id: attemptId,
		status: 'in_progress'
	});
	if (!attempt) return null;

	return store.update<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, orgId, attemptId, {
		status: 'completed',
		completed_at: now.toISOString(),
		updated_at: now.toISOString()
	});
}

export async function markCheckoutAttemptCanceled(
	store: DataStore,
	orgId: string,
	attemptId: string,
	now: Date
): Promise<CheckoutAttemptRow | null> {
	const attempt = await store.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, orgId, {
		id: attemptId,
		status: 'in_progress'
	});
	if (!attempt) return null;

	return store.update<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, orgId, attemptId, {
		status: 'canceled',
		canceled_at: now.toISOString(),
		updated_at: now.toISOString()
	});
}

export function isActiveCheckoutAttemptConflict(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? '');
	return /duplicate|unique/i.test(message) && message.includes(ACTIVE_CHECKOUT_ATTEMPT_CONSTRAINT);
}

async function findInProgressCheckoutAttempts(store: DataStore, orgId: string): Promise<CheckoutAttemptRow[]> {
	return store.findMany<CheckoutAttemptRow>(
		CHECKOUT_ATTEMPTS_TABLE,
		orgId,
		{ status: 'in_progress' },
		{ orderBy: [{ column: 'created_at', ascending: false }] }
	);
}
