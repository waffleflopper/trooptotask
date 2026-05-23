import type { Session, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SENSITIVE_ACTION_RECENT_SESSION_WINDOW_MS = 15 * 60 * 1000;

export const PLATFORM_ACCESS_REQUEST_APPROVE_ACTION = 'platform.accessRequest.approve';
export const PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION = 'platform.accessRequest.resendSetup';
export const ORGANIZATION_TRANSFER_OWNERSHIP_ACTION = 'organization.transferOwnership';
export const ORGANIZATION_DELETE_ACTION = 'organization.deleteOrganization';
export const BILLING_CHECKOUT_ACTION = 'billing.checkout';
export const BILLING_PORTAL_ACTION = 'billing.portal';
export const BILLING_CANCEL_ACTION = 'billing.cancel';

export type SensitiveAction =
	| typeof PLATFORM_ACCESS_REQUEST_APPROVE_ACTION
	| typeof PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION
	| typeof ORGANIZATION_TRANSFER_OWNERSHIP_ACTION
	| typeof ORGANIZATION_DELETE_ACTION
	| typeof BILLING_CHECKOUT_ACTION
	| typeof BILLING_PORTAL_ACTION
	| typeof BILLING_CANCEL_ACTION
	| (string & {});

export type SensitiveActionDecisionReason =
	| 'allowed.recentSession'
	| 'allowed.mfaAssurance'
	| 'denied.unauthenticated'
	| 'denied.suspendedUser'
	| 'denied.staleSession'
	| 'denied.suspensionStatusUnavailable';

export interface SensitiveActionTarget {
	type: string;
	id: string;
}

export interface SensitiveActionActorFacts {
	userId: string | null;
	sessionStartedAt?: string | Date | null;
	currentAssuranceLevel?: string | null;
	nextAssuranceLevel?: string | null;
	isSuspended?: boolean | null;
	suspensionStatusAvailable?: boolean;
}

export interface SensitiveActionCheckInput {
	action: SensitiveAction;
	actor: SensitiveActionActorFacts;
	target?: SensitiveActionTarget;
	now?: Date;
	recentSessionWindowMs?: number;
}

export interface SensitiveActionDecision {
	allowed: boolean;
	action: SensitiveAction;
	reason: SensitiveActionDecisionReason;
	actorUserId: string | null;
	target?: SensitiveActionTarget;
	currentAssuranceLevel: string | null;
	nextAssuranceLevel: string | null;
	sessionAgeMs: number | null;
	recentSessionWindowMs: number;
	requiresStepUp: boolean;
}

export interface SensitiveActionAuthorizeInput {
	action: SensitiveAction;
	actorUserId: string;
	target?: SensitiveActionTarget;
}

export interface SensitiveActionAuthorizer {
	authorize(input: SensitiveActionAuthorizeInput): Promise<SensitiveActionDecision>;
}

function coerceTimestamp(value: string | Date | null | undefined): number | null {
	if (!value) return null;
	const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
	return Number.isFinite(time) ? time : null;
}

export function checkSensitiveAction(input: SensitiveActionCheckInput): SensitiveActionDecision {
	const now = input.now ?? new Date();
	const recentSessionWindowMs = input.recentSessionWindowMs ?? DEFAULT_SENSITIVE_ACTION_RECENT_SESSION_WINDOW_MS;
	const sessionStartedAt = coerceTimestamp(input.actor.sessionStartedAt);
	const sessionAgeMs = sessionStartedAt === null ? null : Math.max(0, now.getTime() - sessionStartedAt);
	const currentAssuranceLevel = input.actor.currentAssuranceLevel ?? null;
	const nextAssuranceLevel = input.actor.nextAssuranceLevel ?? null;
	const baseDecision = {
		action: input.action,
		actorUserId: input.actor.userId,
		target: input.target,
		currentAssuranceLevel,
		nextAssuranceLevel,
		sessionAgeMs,
		recentSessionWindowMs
	};

	if (!input.actor.userId) {
		return { ...baseDecision, allowed: false, reason: 'denied.unauthenticated', requiresStepUp: true };
	}

	const hasSuspensionStatus = typeof input.actor.isSuspended === 'boolean';
	if (input.actor.suspensionStatusAvailable === false || !hasSuspensionStatus) {
		return {
			...baseDecision,
			allowed: false,
			reason: 'denied.suspensionStatusUnavailable',
			requiresStepUp: false
		};
	}

	if (input.actor.isSuspended) {
		return { ...baseDecision, allowed: false, reason: 'denied.suspendedUser', requiresStepUp: false };
	}

	if (currentAssuranceLevel === 'aal2') {
		return { ...baseDecision, allowed: true, reason: 'allowed.mfaAssurance', requiresStepUp: false };
	}

	if (sessionAgeMs !== null && sessionAgeMs <= recentSessionWindowMs) {
		return { ...baseDecision, allowed: true, reason: 'allowed.recentSession', requiresStepUp: false };
	}

	return { ...baseDecision, allowed: false, reason: 'denied.staleSession', requiresStepUp: true };
}

export function sensitiveActionDecisionAuditDetails(decision: SensitiveActionDecision): Record<string, unknown> {
	return {
		action: decision.action,
		actorUserId: decision.actorUserId,
		target: decision.target,
		reason: decision.reason,
		currentAssuranceLevel: decision.currentAssuranceLevel,
		nextAssuranceLevel: decision.nextAssuranceLevel,
		sessionAgeMs: decision.sessionAgeMs,
		recentSessionWindowMs: decision.recentSessionWindowMs,
		requiresStepUp: decision.requiresStepUp
	};
}

export function sensitiveActionDenialMessage(decision: SensitiveActionDecision): string {
	switch (decision.reason) {
		case 'denied.suspendedUser':
			return 'This account is suspended and cannot perform sensitive actions.';
		case 'denied.suspensionStatusUnavailable':
			return 'We could not confirm this account is allowed to perform sensitive actions. Please try again.';
		case 'denied.unauthenticated':
			return 'Please sign in again before continuing.';
		case 'denied.staleSession':
		default:
			return 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.';
	}
}

export function sensitiveActionStepUpPath(decision: SensitiveActionDecision): string | null {
	if (!decision.requiresStepUp) return null;
	return decision.nextAssuranceLevel === 'aal2' ? '/auth/mfa-verify' : '/auth/login';
}

export function createSensitiveActionAuthorizer(input: {
	loadActorFacts: (actorUserId: string) => Promise<Omit<SensitiveActionActorFacts, 'userId'>>;
	now?: () => Date;
	recentSessionWindowMs?: number;
}): SensitiveActionAuthorizer {
	return {
		async authorize(request) {
			const facts = await input.loadActorFacts(request.actorUserId);
			return checkSensitiveAction({
				action: request.action,
				target: request.target,
				actor: { userId: request.actorUserId, ...facts },
				now: input.now?.(),
				recentSessionWindowMs: input.recentSessionWindowMs
			});
		}
	};
}

export function createSupabaseSensitiveActionAuthorizer(input: {
	supabase: SupabaseClient;
	session: Session | null;
	now?: () => Date;
	recentSessionWindowMs?: number;
}): SensitiveActionAuthorizer {
	return createSensitiveActionAuthorizer({
		now: input.now,
		recentSessionWindowMs: input.recentSessionWindowMs,
		loadActorFacts: async (actorUserId) => {
			const assuranceResult = await input.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
			const suspensionResult = await input.supabase.rpc('is_user_suspended', {
				check_user_id: actorUserId
			});

			return {
				sessionStartedAt: input.session?.user?.last_sign_in_at ?? null,
				currentAssuranceLevel: assuranceResult.error ? null : (assuranceResult.data?.currentLevel ?? null),
				nextAssuranceLevel: assuranceResult.error ? null : (assuranceResult.data?.nextLevel ?? null),
				isSuspended: suspensionResult.error ? null : Boolean(suspensionResult.data),
				suspensionStatusAvailable: !suspensionResult.error
			};
		}
	});
}
