import type {
	BillingReconciliationProvider,
	BillingReconciliationStore,
	BillingReconciliationResult,
	BillingReconciliationSubscriptionPort
} from '$lib/server/core/useCases/billingReconciliation';
import { reconcileOrganizationBilling } from '$lib/server/core/useCases/billingReconciliation';
import type { PriceCatalogEntry } from '$lib/types/subscription';

export interface BillingReconciliationCandidate {
	orgId: string;
}

export interface BillingReconciliationBatchStore extends BillingReconciliationStore {
	listCandidates(input: { limit: number; cursor?: string | null }): Promise<BillingReconciliationCandidate[]>;
}

export interface BillingReconciliationBatchItem {
	orgId: string;
	ok: boolean;
	status: BillingReconciliationResult['status'] | 'error';
	result: string;
	driftDetected: boolean;
	diagnostics: string[];
	plannedWrites: string[];
	dryRun: boolean;
}

export interface BillingReconciliationBatchResult {
	startedAt: string;
	finishedAt: string;
	processed: number;
	succeeded: number;
	failed: number;
	drifted: number;
	timedOut: boolean;
	nextCursor: string | null;
	dryRun: boolean;
	results: BillingReconciliationBatchItem[];
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_TIMEOUT_MS = 25_000;

export function normalizeBillingReconciliationBatchLimit(value: number | null | undefined): number {
	if (!Number.isFinite(value ?? NaN)) return DEFAULT_LIMIT;
	return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value as number)));
}

function sanitizeDiagnostic(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value ?? 'unknown_error');
	return message
		.replace(/[sr]k_(live|test)_[A-Za-z0-9_]+/g, '[redacted_stripe_key]')
		.replace(/whsec_\S+/g, '[redacted_webhook_secret]')
		.replace(/bearer\s+\S+/gi, 'bearer [redacted]');
}

export async function runBillingReconciliationBatch(input: {
	store: BillingReconciliationBatchStore;
	provider: BillingReconciliationProvider;
	createSubscriptionPort: (orgId: string) => BillingReconciliationSubscriptionPort;
	priceCatalog: PriceCatalogEntry[];
	limit?: number | null;
	cursor?: string | null;
	timeoutMs?: number;
	now?: () => Date;
	dryRun?: boolean;
}): Promise<BillingReconciliationBatchResult> {
	const now = input.now ?? (() => new Date());
	const dryRun = input.dryRun ?? false;
	const startedAt = now().toISOString();
	const timeoutMs = Math.max(1, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const limit = normalizeBillingReconciliationBatchLimit(input.limit);
	const candidates = (await input.store.listCandidates({ limit, cursor: input.cursor ?? null })).slice(0, limit);
	const startedMs = Date.now();
	const results: BillingReconciliationBatchItem[] = [];
	let timedOut = false;

	for (const candidate of candidates) {
		if (Date.now() - startedMs >= timeoutMs) {
			timedOut = true;
			break;
		}

		try {
			const result = await reconcileOrganizationBilling({
				orgId: candidate.orgId,
				store: input.store,
				provider: input.provider,
				subscription: input.createSubscriptionPort(candidate.orgId),
				priceCatalog: input.priceCatalog,
				now,
				dryRun
			});
			results.push({
				orgId: candidate.orgId,
				ok: result.ok,
				status: result.status,
				result: result.result,
				driftDetected: result.driftDetected,
				diagnostics: result.diagnostics.map(sanitizeDiagnostic),
				plannedWrites: result.plannedWrites,
				dryRun: result.dryRun
			});
		} catch (err) {
			results.push({
				orgId: candidate.orgId,
				ok: false,
				status: 'error',
				result: 'Unexpected reconciliation failure.',
				driftDetected: true,
				diagnostics: [sanitizeDiagnostic(err)],
				plannedWrites: [],
				dryRun
			});
		}
	}

	const lastProcessed = results.at(-1)?.orgId ?? null;
	const nextCursor = timedOut
		? (lastProcessed ?? input.cursor ?? null)
		: candidates.length === limit
			? (candidates.at(-1)?.orgId ?? null)
			: null;
	const failed = results.filter((result) => !result.ok).length;
	const drifted = results.filter((result) => result.driftDetected).length;

	return {
		startedAt,
		finishedAt: now().toISOString(),
		processed: results.length,
		succeeded: results.length - failed,
		failed,
		drifted,
		timedOut,
		nextCursor,
		dryRun,
		results
	};
}
