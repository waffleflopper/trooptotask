import {
	evaluatePolicyDecision,
	type IdentityOwnedPolicyAction,
	type PolicyReasonCode
} from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';

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
	const isReadOnly = (await ports.readOnlyGuard?.check()) ?? false;
	const decision = evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: ports.auth.role, userId: ports.auth.userId },
		action,
		capabilityMap: ports.auth.capabilityMap,
		scopeSet: ports.auth.scopeSet,
		resource: ownerUserId ? { kind: 'user', userId: ownerUserId } : { kind: 'unscoped' },
		overlays: isReadOnly ? [{ id: 'read-only-mode', kind: 'read-only-mode', label: 'Organization read-only mode' }] : []
	});

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
