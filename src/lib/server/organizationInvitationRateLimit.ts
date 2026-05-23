import type { SupabaseClient } from '@supabase/supabase-js';
import {
	checkDurableRateLimit,
	createSupabaseDurableRateLimitStore,
	durableRateLimitAuditDetails,
	normalizeRateLimitEmail,
	type DurableRateLimitDecision,
	type DurableRateLimitStore
} from './durableRateLimit';

export const ORGANIZATION_INVITATION_CREATE_RATE_LIMIT_MESSAGE =
	'Too many organization invitation attempts. Please wait before inviting this recipient again.';
export const ORGANIZATION_INVITATION_RESEND_RATE_LIMIT_MESSAGE =
	'Too many organization invitation resend attempts. Please wait before trying again.';

const WINDOW_MS = 15 * 60 * 1000;
const ACTOR_MAX_ATTEMPTS = 30;
const ORGANIZATION_MAX_ATTEMPTS = 100;
const RECIPIENT_MAX_ATTEMPTS = 3;
const INVITATION_MAX_ATTEMPTS = 3;

export type OrganizationInvitationRateLimitAction = 'create' | 'resend';
export type OrganizationInvitationRateLimitStore = DurableRateLimitStore;

export interface OrganizationInvitationRateLimitDecision {
	limited: boolean;
	retryAfterMs?: number;
	action: OrganizationInvitationRateLimitAction;
	checks: DurableRateLimitDecision[];
}

export interface OrganizationInvitationRateLimiter {
	check(input: {
		action: OrganizationInvitationRateLimitAction;
		actorUserId: string;
		organizationId: string;
		recipientEmail: string;
		invitationId?: string | null;
		now?: Date;
	}): Promise<OrganizationInvitationRateLimitDecision>;
}

interface RateLimitCheckConfig {
	dimension: 'actor' | 'organization' | 'recipient' | 'invitation';
	value: string;
	maxRequests: number;
}

export function createSupabaseOrganizationInvitationRateLimitStore(
	supabase?: SupabaseClient
): OrganizationInvitationRateLimitStore {
	return createSupabaseDurableRateLimitStore(supabase);
}

export function createOrganizationInvitationRateLimiter(input: {
	store?: OrganizationInvitationRateLimitStore;
}): OrganizationInvitationRateLimiter {
	return {
		check: (checkInput) =>
			checkOrganizationInvitationRateLimit({
				...checkInput,
				store: input.store
			})
	};
}

export function createSupabaseOrganizationInvitationRateLimiter(
	supabase?: SupabaseClient
): OrganizationInvitationRateLimiter {
	return createOrganizationInvitationRateLimiter({
		store: createSupabaseOrganizationInvitationRateLimitStore(supabase)
	});
}

function requireRateLimitDimension(value: string, name: string): string {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		throw new Error(`${name} is required for organization invitation rate limiting`);
	}
	return trimmedValue;
}

function actionNamespace(
	action: OrganizationInvitationRateLimitAction,
	dimension: RateLimitCheckConfig['dimension']
): string {
	return `organization-invitation-${action}-${dimension}`;
}

export async function checkOrganizationInvitationRateLimit(input: {
	action: OrganizationInvitationRateLimitAction;
	actorUserId: string;
	organizationId: string;
	recipientEmail: string;
	invitationId?: string | null;
	now?: Date;
	store?: OrganizationInvitationRateLimitStore;
}): Promise<OrganizationInvitationRateLimitDecision> {
	const actorUserId = requireRateLimitDimension(input.actorUserId, 'actorUserId');
	const organizationId = requireRateLimitDimension(input.organizationId, 'organizationId');
	const recipientEmail = requireRateLimitDimension(normalizeRateLimitEmail(input.recipientEmail), 'recipientEmail');
	const invitationId =
		input.action === 'resend' ? requireRateLimitDimension(input.invitationId ?? '', 'invitationId') : null;
	const store = input.store ?? createSupabaseOrganizationInvitationRateLimitStore();
	const checks: DurableRateLimitDecision[] = [];
	const configs: RateLimitCheckConfig[] = [
		{ dimension: 'actor', value: actorUserId, maxRequests: ACTOR_MAX_ATTEMPTS },
		{ dimension: 'organization', value: organizationId, maxRequests: ORGANIZATION_MAX_ATTEMPTS },
		...(invitationId
			? [{ dimension: 'invitation' as const, value: invitationId, maxRequests: INVITATION_MAX_ATTEMPTS }]
			: []),
		{ dimension: 'recipient', value: recipientEmail, maxRequests: RECIPIENT_MAX_ATTEMPTS }
	];

	for (const config of configs) {
		const decision = await checkDurableRateLimit({
			namespace: actionNamespace(input.action, config.dimension),
			dimensions: [{ name: config.dimension, value: config.value }],
			windowMs: WINDOW_MS,
			maxRequests: config.maxRequests,
			now: input.now,
			store
		});
		checks.push(decision);
		if (decision.limited) {
			return {
				limited: true,
				retryAfterMs: decision.retryAfterMs,
				action: input.action,
				checks
			};
		}
	}

	return {
		limited: false,
		action: input.action,
		checks
	};
}

export function organizationInvitationRateLimitMessage(
	action: OrganizationInvitationRateLimitAction,
	retryAfterMs?: number
): string {
	const base =
		action === 'create'
			? ORGANIZATION_INVITATION_CREATE_RATE_LIMIT_MESSAGE
			: ORGANIZATION_INVITATION_RESEND_RATE_LIMIT_MESSAGE;
	if (!retryAfterMs || retryAfterMs <= 0) return base;
	return `${base} Try again in about ${formatRetryAfter(retryAfterMs)}.`;
}

export function organizationInvitationRateLimitAuditDetails(
	decision: OrganizationInvitationRateLimitDecision
): Record<string, unknown> {
	return {
		action: decision.action,
		checks: decision.checks.map(durableRateLimitAuditDetails),
		...(decision.limited ? { retryAfterMs: decision.retryAfterMs } : {})
	};
}

function formatRetryAfter(retryAfterMs: number): string {
	const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
	if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
	const minutes = Math.ceil(seconds / 60);
	return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
