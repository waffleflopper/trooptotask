import type {
	FeatureLanePolicyAction,
	OrganizationGovernancePolicyAction,
	PolicyReasonCode,
	PolicyResource
} from '$lib/access/policyEvaluator';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { fail } from '$lib/server/core/errors';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';

interface PolicyPorts {
	auth: Pick<AuthContext, 'role' | 'capabilityMap' | 'compatibilityLanes' | 'scopeSet'>;
	audit: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
}

type ServerPolicyAction = FeatureLanePolicyAction | OrganizationGovernancePolicyAction;

export async function requirePolicyDecision(
	ports: PolicyPorts,
	action: ServerPolicyAction,
	resource: PolicyResource
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(ports, action, resource);

	if (decision.allowed) {
		return;
	}

	if (decision.audit.capture) {
		ports.audit.log({
			action: 'policy.denied',
			resourceType: action.id,
			details: {
				policyAction: action.id,
				reasonCode: decision.reasonCode,
				resource,
				...(decision.matchedCapability ? { matchedCapability: decision.matchedCapability } : {}),
				...(decision.matchedScope ? { matchedScope: decision.matchedScope } : {}),
				...(decision.blockingOverlay ? { blockingOverlay: decision.blockingOverlay.kind } : {})
			},
			severity: 'warning'
		});
	}

	fail(403, policyDenialMessage(decision.reasonCode, ports.auth.scopeSet));
}

export function policyDenialMessage(reasonCode: PolicyReasonCode, scopeSet?: ScopeSet): string {
	if (reasonCode === 'denied:read-only-overlay') {
		return 'Organization is in read-only mode';
	}

	if (reasonCode === 'denied:out-of-scope') {
		return scopeSet?.kind === 'groups'
			? 'This action is outside your assigned Group scope'
			: 'This action is outside your assigned scope';
	}

	if (reasonCode === 'denied:unauthenticated') {
		return 'Unauthorized';
	}

	if (reasonCode === 'denied:not-resource-owner') {
		return 'You can only manage your own resources';
	}

	return 'You do not have permission to perform this action';
}
