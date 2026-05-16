import type {
	FeatureLanePolicyAction,
	OrganizationGovernancePolicyAction,
	PolicyDecision,
	PolicyReasonCode,
	PolicyResource
} from '$lib/access/policyEvaluator';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails, type PolicyDenialAuditDetailsOptions } from './policyDenial';

interface PolicyPorts {
	auth: Pick<AuthContext, 'role' | 'capabilityMap' | 'compatibilityLanes' | 'scopeSet'>;
	audit: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
}

type ServerPolicyAction = FeatureLanePolicyAction | OrganizationGovernancePolicyAction;

const routePolicyAuditDetailShape = {
	matchedCapability: { key: 'matchedCapability', value: 'object' },
	matchedScope: { key: 'matchedScope', value: 'object' }
} satisfies Pick<PolicyDenialAuditDetailsOptions, 'matchedCapability' | 'matchedScope'>;

export async function requirePolicyDecision(
	ports: PolicyPorts,
	action: ServerPolicyAction,
	resource: PolicyResource
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(ports, action, resource);

	if (decision.allowed) {
		return;
	}

	denyRoutePolicyDecision(ports, action, resource, decision);
}

function denyRoutePolicyDecision(
	ports: PolicyPorts,
	action: ServerPolicyAction,
	resource: PolicyResource,
	decision: PolicyDecision
): never {
	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType: action.id,
		details: routePolicyDenialAuditDetails(decision, action, resource),
		message: routePolicyDenialMessage(decision.reasonCode, ports.auth.scopeSet)
	});
}

function routePolicyDenialAuditDetails(
	decision: PolicyDecision,
	action: ServerPolicyAction,
	resource: PolicyResource
): Record<string, unknown> {
	return policyDenialAuditDetails(decision, {
		policyActionId: action.id,
		resource,
		...routePolicyAuditDetailShape
	});
}

function routePolicyDenialMessage(reasonCode: PolicyReasonCode, scopeSet?: ScopeSet): string {
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
