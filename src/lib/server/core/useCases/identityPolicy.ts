import type { IdentityOwnedPolicyAction, PolicyReasonCode } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';

interface IdentityPolicyPorts {
	auth: Pick<AuthContext, 'userId' | 'role' | 'capabilityMap' | 'scopeSet'>;
	audit: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
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

	if (decision.audit.capture) {
		ports.audit.log({
			action: 'policy.denied',
			resourceType,
			resourceId,
			details: {
				policyAction: action.id,
				reasonCode: decision.reasonCode,
				...(decision.blockingOverlay ? { blockingOverlay: decision.blockingOverlay.kind } : {})
			},
			severity: 'warning'
		});
	}

	fail(denialStatus(decision.reasonCode), identityPolicyDenialMessage(decision.reasonCode));
}

function denialStatus(reasonCode: PolicyReasonCode): 401 | 403 {
	return reasonCode === 'denied:unauthenticated' ? 401 : 403;
}

function identityPolicyDenialMessage(reasonCode: PolicyReasonCode): string {
	if (reasonCode === 'denied:unauthenticated') {
		return 'Unauthorized';
	}

	if (reasonCode === 'denied:read-only-overlay') {
		return 'Organization is in read-only mode';
	}

	return 'You can only manage your own resources';
}
