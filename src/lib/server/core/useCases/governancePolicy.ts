import {
	evaluatePolicyDecision,
	type OrganizationGovernancePolicyAction,
	type PolicyReasonCode
} from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';

interface GovernancePolicyPorts {
	auth: AuthContext;
	audit: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
}

export async function requireGovernancePolicy(
	ports: GovernancePolicyPorts,
	action: OrganizationGovernancePolicyAction
): Promise<void> {
	const isReadOnly = (await ports.readOnlyGuard?.check()) ?? false;
	const decision = evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: ports.auth.role },
		action,
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		},
		scopeSet: { kind: 'organization' },
		resource: { kind: 'organization' },
		overlays: isReadOnly ? [{ id: 'read-only-mode', kind: 'read-only-mode', label: 'Organization read-only mode' }] : []
	});

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
