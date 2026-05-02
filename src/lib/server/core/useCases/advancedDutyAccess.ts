import type { AuthContext } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import { POLICY_ACTION_CATALOG, evaluatePolicyDecision } from '$lib/access/policyEvaluator';

export function requireAdvancedDutyAccess(auth: AuthContext): void {
	const decision = evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: auth.role },
		action: POLICY_ACTION_CATALOG.calendar.manageAssignments,
		capabilityMap: auth.capabilityMap,
		compatibilityLanes: auth.compatibilityLanes,
		scopeSet: auth.scopeSet,
		resource: { kind: 'organization' }
	});

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
	return evaluatePolicyDecision({
		decisionKind: 'client-advisory',
		actor: { membershipRole: auth.role },
		action: POLICY_ACTION_CATALOG.calendar.manageAssignments,
		capabilityMap: auth.capabilityMap,
		compatibilityLanes: auth.compatibilityLanes,
		scopeSet: auth.scopeSet,
		resource: { kind: 'organization' }
	}).allowed;
}
