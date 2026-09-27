import {
	POLICY_ACTION_CATALOG,
	type FeatureLanePolicyAction,
	type PolicyDecision,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import type { AuditPort, AuthContext, DataStore, UseCaseContext, WritePorts } from '$lib/server/core/ports';
import type { PersonnelCalendarRosterPort } from '$features/personnel/contracts';
import { requirePersonnelCalendarRoster } from './calendarScope';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails } from './policyDenial';

interface CalendarPolicyPorts {
	auth: AuthContext;
	audit?: AuditPort;

	store?: DataStore;
	personnelCalendarRoster?: PersonnelCalendarRosterPort;
}

export type CalendarPersonnelPolicyPorts = CalendarPolicyPorts & {
	store: DataStore;
	personnelCalendarRoster: PersonnelCalendarRosterPort;
};
export type CalendarWritePorts = WritePorts & Pick<UseCaseContext, 'personnelCalendarRoster'>;

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
	ports: CalendarPersonnelPolicyPorts,
	action: FeatureLanePolicyAction,
	personnelIds: string[]
): Promise<Map<string, string | null>> {
	const uniquePersonnelIds = [...new Set(personnelIds.filter(Boolean))];
	if (uniquePersonnelIds.length === 0) {
		await requireCalendarPolicy(ports, action);
		return new Map();
	}

	await requireCalendarPolicy(ports, action);
	const personnelById = await requirePersonnelCalendarRoster(ports).findGroupIds(ports.auth, uniquePersonnelIds);
	for (const id of uniquePersonnelIds) {
		if (!personnelById.has(id)) {
			// Group-scoped missing rows cannot become an Organization-level grant.
			await requireCalendarPolicy(ports, action, { kind: 'organization' });
			continue;
		}
		const groupId = personnelById.get(id);
		await requireCalendarPolicy(ports, action, groupId ? { kind: 'group', groupId } : { kind: 'organization' });
	}
	return personnelById;
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
