import type { Session, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SENSITIVE_ACTION_RECENT_SESSION_WINDOW_MS = 15 * 60 * 1000;

export const PLATFORM_ACCESS_REQUEST_APPROVE_ACTION = 'platform.accessRequest.approve';
export const PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION = 'platform.accessRequest.resendSetup';
export const PLATFORM_ACCESS_REQUEST_REJECT_ACTION = 'platform.accessRequest.reject';
export const ORGANIZATION_TRANSFER_OWNERSHIP_ACTION = 'organization.transferOwnership';
export const ORGANIZATION_DELETE_ACTION = 'organization.deleteOrganization';
export const BILLING_CHECKOUT_ACTION = 'billing.checkout';
export const BILLING_PORTAL_ACTION = 'billing.portal';
export const BILLING_CANCEL_ACTION = 'billing.cancel';
export const ORGANIZATION_MEMBER_INVITE_HIGH_PRIVILEGE_ACTION = 'organization.member.inviteHighPrivilege';
export const ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION = 'organization.member.updateHighPrivilege';
export const ORGANIZATION_MEMBER_REMOVE_HIGH_PRIVILEGE_ACTION = 'organization.member.removeHighPrivilege';

export type SensitiveAction =
	| typeof PLATFORM_ACCESS_REQUEST_APPROVE_ACTION
	| typeof PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION
	| typeof PLATFORM_ACCESS_REQUEST_REJECT_ACTION
	| typeof ORGANIZATION_TRANSFER_OWNERSHIP_ACTION
	| typeof ORGANIZATION_DELETE_ACTION
	| typeof BILLING_CHECKOUT_ACTION
	| typeof BILLING_PORTAL_ACTION
	| typeof BILLING_CANCEL_ACTION
	| typeof ORGANIZATION_MEMBER_INVITE_HIGH_PRIVILEGE_ACTION
	| typeof ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION
	| typeof ORGANIZATION_MEMBER_REMOVE_HIGH_PRIVILEGE_ACTION;

export type SensitiveActionDecisionReason =
	| 'allowed.recentSession'
	| 'allowed.mfaAssurance'
	| 'denied.unauthenticated'
	| 'denied.suspendedUser'
	| 'denied.staleSession'
	| 'denied.suspensionStatusUnavailable'
	| 'denied.assuranceUnavailable';

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

export interface SensitiveActionFailureFields {
	reason: SensitiveActionDecisionReason;
	requiresStepUp: boolean;
	stepUpPath: string | null;
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
	const sessionAgeMs = sessionStartedAt === null ? null : now.getTime() - sessionStartedAt;
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

	if (!['aal1', 'aal2'].includes(currentAssuranceLevel ?? '') || !['aal1', 'aal2'].includes(nextAssuranceLevel ?? '')) {
		return { ...baseDecision, allowed: false, reason: 'denied.assuranceUnavailable', requiresStepUp: false };
	}

	if (currentAssuranceLevel === 'aal2') {
		return { ...baseDecision, allowed: true, reason: 'allowed.mfaAssurance', requiresStepUp: false };
	}

	if (
		nextAssuranceLevel !== 'aal2' &&
		sessionAgeMs !== null &&
		sessionAgeMs >= 0 &&
		sessionAgeMs <= recentSessionWindowMs
	) {
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
		case 'denied.assuranceUnavailable':
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

export function sensitiveActionFailureFields(decision: SensitiveActionDecision): SensitiveActionFailureFields {
	return {
		reason: decision.reason,
		requiresStepUp: decision.requiresStepUp,
		stepUpPath: sensitiveActionStepUpPath(decision)
	};
}

export function assignSensitiveActionFailureDetails(error: Error, decision: SensitiveActionDecision): Error {
	const details = error as unknown as Record<string, unknown>;
	details.status = 403;
	Object.assign(details, sensitiveActionFailureFields(decision));
	return error;
}

export function throwSensitiveActionFailure(decision: SensitiveActionDecision): never {
	throw assignSensitiveActionFailureDetails(new Error(sensitiveActionDenialMessage(decision)), decision);
}

export function createSensitiveActionAuthorizer(input: {
	loadActorFacts: (actorUserId: string) => Promise<SensitiveActionActorFacts>;
	now?: () => Date;
	recentSessionWindowMs?: number;
}): SensitiveActionAuthorizer {
	return {
		async authorize(request) {
			const facts = await input.loadActorFacts(request.actorUserId);
			return checkSensitiveAction({
				action: request.action,
				target: request.target,
				actor: { ...facts, userId: facts.userId === request.actorUserId ? facts.userId : null },
				now: input.now?.(),
				recentSessionWindowMs: input.recentSessionWindowMs
			});
		}
	};
}

export function createSupabaseSensitiveActionAuthorizer(input: {
	supabase: SupabaseClient;
	session: Session | null;
	/** Identity verified by the request hook; never taken from action input. */
	authenticatedUserId: string | null;
	now?: () => Date;
	recentSessionWindowMs?: number;
}): SensitiveActionAuthorizer {
	return createSensitiveActionAuthorizer({
		now: input.now,
		recentSessionWindowMs: input.recentSessionWindowMs,
		loadActorFacts: async (actorUserId) => {
			const session = input.session;
			const token = session?.access_token;
			const now = () => (input.now?.() ?? new Date()).getTime();
			const sessionIsValid = () =>
				Boolean(
					actorUserId &&
					actorUserId === input.authenticatedUserId &&
					session?.user?.id === actorUserId &&
					typeof token === 'string' &&
					token.trim() &&
					typeof session.expires_at === 'number' &&
					Number.isSafeInteger(session.expires_at) &&
					session.expires_at * 1000 > now()
				);
			if (typeof token !== 'string' || !sessionIsValid()) return { userId: null };

			let currentAssuranceLevel: string | null = null;
			let nextAssuranceLevel: string | null = null;
			let sessionStartedAt: Date | null = null;
			try {
				// Bind provider assurance and AMR to the hook-verified request token.
				const result = await input.supabase.auth.mfa.getAuthenticatorAssuranceLevel(token);
				const data = result?.data;
				if (
					result?.error === null &&
					data &&
					['aal1', 'aal2'].includes(data.currentLevel ?? '') &&
					['aal1', 'aal2'].includes(data.nextLevel ?? '')
				) {
					currentAssuranceLevel = data.currentLevel;
					nextAssuranceLevel = data.nextLevel;
					const methods = data.currentAuthenticationMethods;
					if (
						Array.isArray(methods) &&
						methods.length > 0 &&
						methods.every(
							(method): method is { method: string; timestamp: number } =>
								typeof method === 'object' &&
								method !== null &&
								typeof method.method === 'string' &&
								method.method.trim().length > 0 &&
								Number.isSafeInteger(method.timestamp) &&
								method.timestamp > 0 &&
								method.timestamp * 1000 <= now()
						)
					) {
						sessionStartedAt = new Date(Math.max(...methods.map((method) => method.timestamp)) * 1000);
					}
				}
			} catch {
				// Unavailable assurance cannot fall back to recent-session permission.
			}
			let isSuspended: boolean | null = null;
			try {
				const suspensionResult = await input.supabase.rpc('is_user_suspended', {
					check_user_id: actorUserId
				});
				if (suspensionResult?.error === null && typeof suspensionResult.data === 'boolean') {
					isSuspended = suspensionResult.data;
				}
			} catch {
				// An unavailable lookup must never become an unsuspended actor.
			}

			return {
				userId: sessionIsValid() ? actorUserId : null,
				sessionStartedAt,
				currentAssuranceLevel,
				nextAssuranceLevel,
				isSuspended,
				suspensionStatusAvailable: isSuspended !== null
			};
		}
	});
}
