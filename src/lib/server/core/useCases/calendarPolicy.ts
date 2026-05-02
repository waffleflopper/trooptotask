import {
	evaluatePolicyDecision,
	POLICY_ACTION_CATALOG,
	type FeatureLanePolicyAction,
	type PolicyDecision,
	type PolicyOverlay,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuditPort, AuthContext, DataStore, ReadOnlyGuard } from '$lib/server/core/ports';

interface CalendarPolicyPorts {
	auth: AuthContext;
	audit?: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
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

	logCalendarPolicyDenial(ports, decision, resource);
	fail(403, calendarPolicyDenialMessage(decision));
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
	const groupIds = [
		...new Set(
			personnelRows
				.map((row) => row.group_id)
				.filter((groupId): groupId is string => typeof groupId === 'string' && groupId.length > 0)
		)
	];

	if (groupIds.length === 0) {
		await requireCalendarPolicy(ports, action);
		return;
	}

	for (const groupId of groupIds) {
		await requireCalendarPolicy(ports, action, { kind: 'group', groupId });
	}
}

async function evaluateCalendarPolicy(
	ports: CalendarPolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource
): Promise<PolicyDecision> {
	const overlays: PolicyOverlay[] = [];
	if ((await ports.readOnlyGuard?.check()) ?? false) {
		overlays.push({ id: 'read-only-mode', kind: 'read-only-mode', label: 'Organization read-only mode' });
	}

	return evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: ports.auth.role },
		action,
		capabilityMap: ports.auth.capabilityMap,
		scopeSet: ports.auth.scopeSet,
		resource,
		overlays
	});
}

function logCalendarPolicyDenial(ports: CalendarPolicyPorts, decision: PolicyDecision, resource: PolicyResource): void {
	ports.audit?.log({
		action: 'policy.denied',
		resourceType: 'calendar',
		details: {
			policyAction: decision.action.id,
			reasonCode: decision.reasonCode,
			resource,
			...(decision.blockingOverlay ? { blockingOverlay: decision.blockingOverlay.kind } : {})
		},
		severity: 'warning'
	});
}

function calendarPolicyDenialMessage(decision: PolicyDecision): string {
	if (decision.reasonCode === 'denied:read-only-overlay') {
		return 'Organization is in read-only mode';
	}

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
