import type { OrganizationGovernancePolicyAction, PolicyReasonCode } from '$lib/access/policyEvaluator';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision, NO_FEATURE_CAPABILITIES } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails } from './policyDenial';

interface GovernancePolicyPorts {
	auth: AuthContext;
	audit: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
}

interface GovernancePolicyOptions {
	enforceReadOnlyOverlay?: boolean;
}

export async function requireGovernancePolicy(
	ports: GovernancePolicyPorts,
	action: OrganizationGovernancePolicyAction,
	options: GovernancePolicyOptions = {}
): Promise<void> {
	const enforceReadOnlyOverlay = options.enforceReadOnlyOverlay ?? true;
	const decision = await evaluateAuthoritativePolicyDecision(
		ports,
		action,
		{ kind: 'organization' },
		{
			capabilityMap: NO_FEATURE_CAPABILITIES,
			scopeSet: { kind: 'organization' },
			enforceReadOnlyOverlay
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

	if (reasonCode === 'denied:read-only-overlay') {
		return 'Organization is in read-only mode';
	}

	return 'This action requires an organization admin or owner role';
}
