import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { configuredPriceCatalog } from '$lib/server/billing/priceCatalog';
import { createStripeBillingReconciliationProvider } from '$lib/server/stripe';
import { createSupabaseBillingReconciliationStore } from '$lib/server/adapters/supabaseBillingReconciliation';
import {
	normalizeBillingReconciliationBatchLimit,
	runBillingReconciliationBatch,
	type BillingReconciliationBatchResult
} from '$lib/server/core/useCases/billingReconciliationBatch';

const MAX_TIMEOUT_MS = 55_000;

function isAuthorized(authHeader: string | null, secrets: Array<string | undefined>): boolean {
	if (!authHeader) return false;
	const configuredSecrets = secrets.filter((secret): secret is string => Boolean(secret?.trim()));
	return configuredSecrets.some((secret) => authHeader === `Bearer ${secret}`);
}

function parsePositiveInteger(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export async function _runBillingReconciliationEndpointCore(input: {
	authHeader: string | null;
	secrets: Array<string | undefined>;
	url: URL;
	adminClient: ReturnType<typeof getAdminClient>;
	provider?: ReturnType<typeof createStripeBillingReconciliationProvider>;
	now?: () => Date;
}): Promise<BillingReconciliationBatchResult> {
	if (!isAuthorized(input.authHeader, input.secrets)) {
		throw error(401, 'Unauthorized');
	}

	const limit = normalizeBillingReconciliationBatchLimit(parsePositiveInteger(input.url.searchParams.get('limit')));
	const cursor = input.url.searchParams.get('cursor');
	const requestedTimeoutMs = parsePositiveInteger(input.url.searchParams.get('timeoutMs'));
	const timeoutMs = requestedTimeoutMs ? Math.min(requestedTimeoutMs, MAX_TIMEOUT_MS) : undefined;

	return runBillingReconciliationBatch({
		store: createSupabaseBillingReconciliationStore(input.adminClient),
		provider: input.provider ?? createStripeBillingReconciliationProvider(),
		priceCatalog: configuredPriceCatalog,
		limit,
		cursor,
		timeoutMs,
		now: input.now
	});
}

export const GET: RequestHandler = async ({ request, url }) => {
	const result = await _runBillingReconciliationEndpointCore({
		authHeader: request.headers.get('authorization'),
		secrets: [env.BILLING_RECONCILIATION_SECRET, env.CRON_SECRET],
		url,
		adminClient: getAdminClient()
	});

	return json(result);
};
