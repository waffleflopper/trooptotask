import type { AuthContext } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import {
	POLICY_ACTION_CATALOG,
	evaluatePolicyDecision,
	type PolicyDecision,
	type PolicyDecisionKind
} from '$lib/access/policyEvaluator';

export function requireAdvancedDutyAccess(auth: AuthContext): void {
	const decision = evaluateAdvancedDutyAccess(auth, 'server-authoritative');

	if (!decision.allowed) {
		fail(403, 'Advanced duty is only available to full-organization editors.');
	}
}

export function requireAdvancedDutyTemplateManagement(auth: AuthContext): void {
	requireAdvancedDutyAccess(auth);

	if (!auth.isPrivileged) {
		fail(403, 'Advanced duty templates can only be managed by organization admins and owners.');
	}
}

export function canAccessAdvancedDuty(
	auth: Pick<AuthContext, 'role' | 'capabilityMap' | 'compatibilityLanes' | 'scopeSet'>
): boolean {
	return evaluateAdvancedDutyAccess(auth, 'client-advisory').allowed;
}

function evaluateAdvancedDutyAccess(
	auth: Pick<AuthContext, 'role' | 'capabilityMap' | 'compatibilityLanes' | 'scopeSet'>,
	decisionKind: PolicyDecisionKind
): PolicyDecision {
	return evaluatePolicyDecision({
		decisionKind,
		actor: { membershipRole: auth.role },
		action: POLICY_ACTION_CATALOG.calendar.configureDutyTemplates,
		capabilityMap: auth.capabilityMap,
		compatibilityLanes: auth.compatibilityLanes,
		scopeSet: auth.scopeSet,
		resource: { kind: 'organization' }
	});
}
