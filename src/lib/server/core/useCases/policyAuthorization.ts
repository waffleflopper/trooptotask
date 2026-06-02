import type { PolicyAction, PolicyDecision, PolicyResource } from '$lib/access/policyEvaluator';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { AuditPort, AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails, type PolicyDenialAuditDetailsOptions } from './policyDenial';

interface PolicyPorts {
	auth: Pick<AuthContext, 'role' | 'capabilityMap' | 'scopeSet'> & Partial<Pick<AuthContext, 'userId'>>;
	audit: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
}

type ServerPolicyAction = PolicyAction;

interface PolicyDecisionOptions {
	enforceReadOnlyOverlay?: boolean;
}

const routePolicyAuditDetailShape = {
	matchedCapability: { key: 'matchedCapability', value: 'object' },
	matchedScope: { key: 'matchedScope', value: 'object' }
} satisfies Pick<PolicyDenialAuditDetailsOptions, 'matchedCapability' | 'matchedScope'>;

export async function requirePolicyDecision(
	ports: PolicyPorts,
	action: ServerPolicyAction,
	resource: PolicyResource,
	options: PolicyDecisionOptions = {}
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(ports, action, resource, options);

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
		message: routePolicyDenialMessage(decision, ports.auth.scopeSet)
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

function routePolicyDenialMessage(decision: PolicyDecision, scopeSet?: ScopeSet): string {
	if (decision.reasonCode === 'denied:read-only-overlay') {
		return decision.blockingOverlay?.label ?? 'Organization is in read-only mode';
	}

	if (decision.reasonCode === 'denied:out-of-scope') {
		return scopeSet?.kind === 'groups'
			? 'This action is outside your assigned Group scope'
			: 'This action is outside your assigned scope';
	}

	if (decision.reasonCode === 'denied:unauthenticated') {
		return 'Unauthorized';
	}

	if (decision.reasonCode === 'denied:not-resource-owner') {
		return 'You can only manage your own resources';
	}

	if (decision.reasonCode === 'denied:owner-only') {
		return 'Only the organization owner can perform this action';
	}

	if (decision.reasonCode === 'denied:missing-capability') {
		return missingCapabilityMessage(decision);
	}

	return 'You do not have permission to perform this action';
}

function missingCapabilityMessage(decision: PolicyDecision): string {
	if (decision.action.owner.kind !== 'feature-lane' || !decision.matchedCapability) {
		return 'You do not have permission to perform this action';
	}

	const lane = featureLaneLabel(decision.matchedCapability.lane);
	const permission = capabilityPermissionLabel(decision.matchedCapability.required);
	return `You don't have permission. This requires ${lane} ${permission} permissions. Talk to your organization owner or admin.`;
}

function featureLaneLabel(lane: string): string {
	switch (lane) {
		case 'criticalTasks':
			return 'Critical Tasks';
		case 'ratingScheme':
			return 'Evals';
		default:
			return lane.charAt(0).toUpperCase() + lane.slice(1);
	}
}

function capabilityPermissionLabel(required: string): string {
	switch (required) {
		case 'view':
			return 'can view';
		case 'operate':
		case 'configure':
			return 'can manage';
		default:
			return 'the required';
	}
}
