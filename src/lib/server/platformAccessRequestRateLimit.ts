import type { SupabaseClient } from '@supabase/supabase-js';
import {
	checkDurableRateLimit,
	createSupabaseDurableRateLimitStore,
	durableRateLimitAuditDetails,
	type DurableRateLimitDecision,
	type DurableRateLimitStore
} from './durableRateLimit';

export const PLATFORM_ACCESS_REQUEST_APPROVAL_RATE_LIMIT_MESSAGE =
	'Too many approval setup sends for this Access Request. Please wait before trying again.';
export const PLATFORM_ACCESS_REQUEST_RESEND_RATE_LIMIT_MESSAGE =
	'Too many setup email resends for this Access Request. Please wait before trying again.';

const WINDOW_MS = 15 * 60 * 1000;
const REQUEST_MAX_ATTEMPTS = 3;
const ADMIN_MAX_ATTEMPTS = 30;

export type PlatformAccessRequestSetupAction = 'approval' | 'resend';
export type PlatformAccessRequestRateLimitStore = DurableRateLimitStore;

export interface PlatformAccessRequestRateLimitDecision {
	limited: boolean;
	retryAfterMs?: number;
	action: PlatformAccessRequestSetupAction;
	checks: DurableRateLimitDecision[];
}

export function createSupabasePlatformAccessRequestRateLimitStore(
	supabase?: SupabaseClient
): PlatformAccessRequestRateLimitStore {
	return createSupabaseDurableRateLimitStore(supabase);
}

function requireRateLimitDimension(value: string, name: string): string {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		throw new Error(`${name} is required for platform Access Request rate limiting`);
	}
	return trimmedValue;
}

function actionNamespace(action: PlatformAccessRequestSetupAction, dimension: 'admin' | 'request'): string {
	return `platform-access-request-setup-${action}-${dimension}`;
}

export async function checkPlatformAccessRequestSetupRateLimit(input: {
	action: PlatformAccessRequestSetupAction;
	adminUserId: string;
	accessRequestId: string;
	now?: Date;
	store?: PlatformAccessRequestRateLimitStore;
}): Promise<PlatformAccessRequestRateLimitDecision> {
	const adminUserId = requireRateLimitDimension(input.adminUserId, 'adminUserId');
	const accessRequestId = requireRateLimitDimension(input.accessRequestId, 'accessRequestId');
	const store = input.store ?? createSupabasePlatformAccessRequestRateLimitStore();
	const adminDecision = await checkDurableRateLimit({
		namespace: actionNamespace(input.action, 'admin'),
		dimensions: [{ name: 'admin', value: adminUserId }],
		windowMs: WINDOW_MS,
		maxRequests: ADMIN_MAX_ATTEMPTS,
		now: input.now,
		store
	});
	if (adminDecision.limited) {
		return {
			limited: true,
			retryAfterMs: adminDecision.retryAfterMs,
			action: input.action,
			checks: [adminDecision]
		};
	}

	const requestDecision = await checkDurableRateLimit({
		namespace: actionNamespace(input.action, 'request'),
		dimensions: [{ name: 'request', value: accessRequestId }],
		windowMs: WINDOW_MS,
		maxRequests: REQUEST_MAX_ATTEMPTS,
		now: input.now,
		store
	});
	const checks = [adminDecision, requestDecision];
	const limitedChecks = checks.filter((check) => check.limited);
	const retryAfterMs = Math.max(...limitedChecks.map((check) => check.retryAfterMs), 0);

	if (limitedChecks.length > 0) {
		return {
			limited: true,
			retryAfterMs,
			action: input.action,
			checks
		};
	}

	return {
		limited: false,
		action: input.action,
		checks
	};
}

export function platformAccessRequestRateLimitMessage(action: PlatformAccessRequestSetupAction): string {
	return action === 'approval'
		? PLATFORM_ACCESS_REQUEST_APPROVAL_RATE_LIMIT_MESSAGE
		: PLATFORM_ACCESS_REQUEST_RESEND_RATE_LIMIT_MESSAGE;
}

export function platformAccessRequestRateLimitAuditDetails(
	decision: PlatformAccessRequestRateLimitDecision
): Record<string, unknown> {
	return {
		action: decision.action,
		checks: decision.checks.map(durableRateLimitAuditDetails),
		...(decision.limited ? { retryAfterMs: decision.retryAfterMs } : {})
	};
}
