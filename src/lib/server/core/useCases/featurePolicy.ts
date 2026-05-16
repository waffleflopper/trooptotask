import type {
	FeatureLanePolicyAction,
	PolicyDecision,
	PolicyReasonCode,
	PolicyResource
} from '$lib/access/policyEvaluator';
import { scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';
import type { AuditPort, AuthContext, DataStore, ReadOnlyGuard } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails } from './policyDenial';

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

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType,
		resourceId,
		details: policyDenialAuditDetails(decision, {
			policyActionId: action.id,
			matchedCapability: { key: 'capability', value: 'actual' },
			matchedScope: { key: 'scope', value: 'kind' }
		}),
		message: featurePolicyDenialMessage(decision.reasonCode, action.owner.lane)
	});
}

export async function evaluateFeaturePolicy(
	ports: FeaturePolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource
): Promise<PolicyDecision> {
	return evaluateAuthoritativePolicyDecision(ports, action, resource);
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
