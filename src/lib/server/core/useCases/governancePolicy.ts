import type { OrganizationGovernancePolicyAction, PolicyReasonCode } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision, NO_FEATURE_CAPABILITIES } from './policyAdapter';

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

	ports.audit.log({
		action: 'policy.denied',
		resourceType: 'organization',
		details: {
			policyAction: action.id,
			reasonCode: decision.reasonCode,
			...(decision.blockingOverlay ? { blockingOverlay: decision.blockingOverlay.kind } : {})
		},
		severity: 'warning'
	});

	fail(403, policyDenialMessage(decision.reasonCode));
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
