import {
	evaluatePolicyDecision,
	type FeatureLanePolicyAction,
	type PolicyReasonCode,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';

interface FeaturePolicyPorts {
	auth: AuthContext;
	audit?: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
}

export function policyResourceForGroup(groupId: unknown): PolicyResource {
	return typeof groupId === 'string' && groupId.length > 0 ? { kind: 'group', groupId } : { kind: 'organization' };
}

export async function requireFeaturePolicy(
	ports: FeaturePolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource,
	resourceType: string,
	resourceId?: string
): Promise<void> {
	const isReadOnly = (await ports.readOnlyGuard?.check()) ?? false;
	const decision = evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: ports.auth.role },
		action,
		capabilityMap: ports.auth.capabilityMap,
		scopeSet: ports.auth.scopeSet,
		resource,
		overlays: isReadOnly ? [{ id: 'read-only-mode', kind: 'read-only-mode', label: 'Organization read-only mode' }] : []
	});

	if (decision.allowed) {
		return;
	}

	if (decision.audit.capture && ports.audit) {
		ports.audit.log({
			action: 'policy.denied',
			resourceType,
			resourceId,
			details: {
				policyAction: action.id,
				reasonCode: decision.reasonCode,
				...(decision.matchedCapability ? { capability: decision.matchedCapability.actual } : {}),
				...(decision.matchedScope ? { scope: decision.matchedScope.kind } : {}),
				...(decision.blockingOverlay ? { blockingOverlay: decision.blockingOverlay.kind } : {})
			},
			severity: 'warning'
		});
	}

	fail(403, featurePolicyDenialMessage(decision.reasonCode, action.owner.lane));
}

function featurePolicyDenialMessage(reasonCode: PolicyReasonCode, lane: string): string {
	switch (reasonCode) {
		case 'denied:read-only-overlay':
			return 'Organization is in read-only mode';
		case 'denied:out-of-scope':
			return 'You do not have access to records outside your assigned scope';
		default:
			return `You do not have permission to use ${lane} data`;
	}
}
