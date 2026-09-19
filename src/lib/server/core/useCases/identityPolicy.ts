import type { IdentityOwnedPolicyAction, PolicyReasonCode } from '$lib/access/policyEvaluator';
import type { AuditPort, AuthContext } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails } from './policyDenial';

interface IdentityPolicyPorts {
	auth: Pick<AuthContext, 'userId' | 'role' | 'capabilityMap' | 'scopeSet'>;
	audit: AuditPort;
}

export async function requireIdentityOwnedPolicy(
	ports: IdentityPolicyPorts,
	action: IdentityOwnedPolicyAction,
	ownerUserId: string | null | undefined,
	resourceType: string,
	resourceId?: string
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(
		ports,
		action,
		ownerUserId ? { kind: 'user', userId: ownerUserId } : { kind: 'unscoped' }
	);

	if (decision.allowed) {
		return;
	}

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType,
		resourceId,
		details: policyDenialAuditDetails(decision, { policyActionId: action.id }),
		status: denialStatus(decision.reasonCode),
		message: identityPolicyDenialMessage(decision.reasonCode)
	});
}

function denialStatus(reasonCode: PolicyReasonCode): 401 | 403 {
	return reasonCode === 'denied:unauthenticated' ? 401 : 403;
}

function identityPolicyDenialMessage(reasonCode: PolicyReasonCode): string {
	if (reasonCode === 'denied:unauthenticated') {
		return 'Unauthorized';
	}

	return 'You can only manage your own resources';
}
