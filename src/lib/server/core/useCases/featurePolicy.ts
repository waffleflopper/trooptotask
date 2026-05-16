import {
	evaluatePolicyDecision,
	type FeatureLanePolicyAction,
	type PolicyDecision,
	type PolicyReasonCode,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import { scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';
import { fail } from '$lib/server/core/errors';
import type { AuditPort, AuthContext, DataStore, ReadOnlyGuard } from '$lib/server/core/ports';

interface FeaturePolicyPorts {
	auth: AuthContext;
	audit?: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
}

interface FeaturePolicyResourcePorts {
	store: Pick<DataStore, 'findOne' | 'findMany'>;
	auth: Pick<AuthContext, 'orgId'>;
}

interface PersonnelPolicyResourceRow {
	id: string;
	group_id: string | null;
}

export function policyResourceForGroup(groupId: unknown): PolicyResource {
	return scopeSetResourceForGroupId(groupId);
}

export async function policyResourceForPersonnel(
	ports: FeaturePolicyResourcePorts,
	personnelId: string
): Promise<PolicyResource> {
	const personnel = await ports.store.findOne<Pick<PersonnelPolicyResourceRow, 'group_id'>>(
		'personnel',
		ports.auth.orgId,
		{ id: personnelId },
		'group_id'
	);
	return policyResourceForGroup(personnel?.group_id);
}

export async function policyResourcesForPersonnel(
	ports: FeaturePolicyResourcePorts,
	personnelIds: string[]
): Promise<Map<string, PolicyResource>> {
	if (personnelIds.length === 0) {
		return new Map();
	}

	const rows = await ports.store.findMany<PersonnelPolicyResourceRow>('personnel', ports.auth.orgId, undefined, {
		inFilters: { id: personnelIds },
		select: 'id, group_id'
	});
	const resources = new Map(rows.map((row) => [row.id, policyResourceForGroup(row.group_id)]));
	for (const personnelId of personnelIds) {
		if (!resources.has(personnelId)) {
			resources.set(personnelId, { kind: 'organization' });
		}
	}
	return resources;
}

export async function requireFeaturePolicy(
	ports: FeaturePolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource,
	resourceType: string,
	resourceId?: string
): Promise<void> {
	const decision = await evaluateFeaturePolicy(ports, action, resource);

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

export async function evaluateFeaturePolicy(
	ports: FeaturePolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource
): Promise<PolicyDecision> {
	const isReadOnly = (await ports.readOnlyGuard?.check()) ?? false;
	return evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: ports.auth.role },
		action,
		capabilityMap: ports.auth.capabilityMap,
		compatibilityLanes: ports.auth.compatibilityLanes,
		scopeSet: ports.auth.scopeSet,
		resource,
		overlays: isReadOnly ? [{ id: 'read-only-mode', kind: 'read-only-mode', label: 'Organization read-only mode' }] : []
	});
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
