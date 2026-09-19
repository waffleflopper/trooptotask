import type { OrganizationGovernancePolicyAction, PolicyReasonCode } from '$lib/access/policyEvaluator';
import type { AuditPort, AuthContext } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision, NO_FEATURE_CAPABILITIES } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails } from './policyDenial';

interface GovernancePolicyPorts {
	auth: AuthContext;
	audit: AuditPort;
}

export async function requireGovernancePolicy(
	ports: GovernancePolicyPorts,
	action: OrganizationGovernancePolicyAction
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(
		ports,
		action,
		{ kind: 'organization' },
		{
			capabilityMap: NO_FEATURE_CAPABILITIES,
			scopeSet: { kind: 'organization' }
		}
	);

	if (decision.allowed) {
		return;
	}

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType: 'organization',
		details: policyDenialAuditDetails(decision, { policyActionId: action.id }),
		message: policyDenialMessage(decision.reasonCode)
	});
}

function policyDenialMessage(reasonCode: PolicyReasonCode): string {
	if (reasonCode === 'denied:owner-only') {
		return 'Only the organization owner can perform this action';
	}

	return 'This action requires an organization admin or owner role';
}
