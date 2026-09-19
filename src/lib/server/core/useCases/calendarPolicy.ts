import {
	POLICY_ACTION_CATALOG,
	type FeatureLanePolicyAction,
	type PolicyDecision,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import type { AuditPort, AuthContext, DataStore } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails } from './policyDenial';

interface CalendarPolicyPorts {
	auth: AuthContext;
	audit?: AuditPort;

	store?: DataStore;
	rawStore?: DataStore;
}

export const CALENDAR_POLICY_ACTIONS = POLICY_ACTION_CATALOG.calendar;

export async function requireCalendarPolicy(
	ports: CalendarPolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource = { kind: 'unscoped' }
): Promise<void> {
	const decision = await evaluateCalendarPolicy(ports, action, resource);
	if (decision.allowed) return;

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType: 'calendar',
		details: policyDenialAuditDetails(decision, { resource }),
		message: calendarPolicyDenialMessage(decision)
	});
}

export async function requireCalendarPersonnelPolicy(
	ports: CalendarPolicyPorts & { store: DataStore },
	action: FeatureLanePolicyAction,
	personnelIds: string[]
): Promise<void> {
	const uniquePersonnelIds = [...new Set(personnelIds.filter(Boolean))];
	if (uniquePersonnelIds.length === 0) {
		await requireCalendarPolicy(ports, action);
		return;
	}

	const lookupStore = ports.rawStore ?? ports.store;
	const personnelRows = await lookupStore.findMany<Record<string, unknown>>('personnel', ports.auth.orgId, undefined, {
		inFilters: { id: uniquePersonnelIds },
		select: 'id, group_id'
	});
	const personnelById = new Map(personnelRows.map((row) => [row.id, row]));
	const groupIds = new Set(
		uniquePersonnelIds.map((id) => {
			const groupId = personnelById.get(id)?.group_id;
			return typeof groupId === 'string' && groupId.length > 0 ? groupId : null;
		})
	);

	// Missing rows can be hidden by RLS; they cannot grant unscoped access.
	for (const groupId of groupIds) {
		await requireCalendarPolicy(ports, action, groupId ? { kind: 'group', groupId } : { kind: 'organization' });
	}
}

async function evaluateCalendarPolicy(
	ports: CalendarPolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource
): Promise<PolicyDecision> {
	return evaluateAuthoritativePolicyDecision(ports, action, resource);
}

function calendarPolicyDenialMessage(decision: PolicyDecision): string {
	if (decision.reasonCode === 'denied:out-of-scope') {
		return 'You do not have access to that Calendar scope';
	}

	if ('requiredCapability' in decision.action && decision.action.requiredCapability === 'configure') {
		return 'This action requires Calendar configuration access';
	}

	if ('requiredCapability' in decision.action && decision.action.requiredCapability === 'operate') {
		return 'This action requires Calendar operation access';
	}

	return 'You do not have permission to view calendar data';
}
