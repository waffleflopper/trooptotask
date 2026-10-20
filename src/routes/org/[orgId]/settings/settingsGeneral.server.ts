import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { AuditLogEntry } from '$lib/audit/contracts';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { readUnitCounts, type OrganizationUnitCountsPort } from '$features/organization/index.server';
import {
	CALENDAR_COUNT_KEYS,
	type GeneralSettingsData,
	type GeneralSettingsOrganization,
	type LastRenamed
} from '$features/organization/contracts';

export interface GeneralSettingsPorts {
	auth: Pick<OrganizationAccessGrant, 'role' | 'userId' | 'capabilityMap' | 'scopeSet'>;
	unitCounts: OrganizationUnitCountsPort;
	/** Reads the audit log with privileged access, so it runs only after the audit-log policy admits the member. */
	readLatestAuditEvent: (action: string) => Promise<AuditLogEntry | null>;
}

function canReadAuditLog(auth: GeneralSettingsPorts['auth']): boolean {
	return evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: auth.role, userId: auth.userId },
		action: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
		capabilityMap: auth.capabilityMap,
		scopeSet: auth.scopeSet,
		resource: { kind: 'organization' }
	}).allowed;
}

/** The name and web address render on first paint; the last rename and the Calendar counts stream. */
export function loadGeneralSettings(
	ports: GeneralSettingsPorts,
	organization: GeneralSettingsOrganization
): GeneralSettingsData {
	return {
		organization,
		lastRenamed: canReadAuditLog(ports.auth)
			? keepStreamedRejectionObserved(
					ports
						.readLatestAuditEvent('org.renamed')
						.then((entry): LastRenamed | null => entry && { at: entry.createdAt, actor: entry.actor })
				)
			: null,
		calendarCounts: keepStreamedRejectionObserved(readUnitCounts(ports.unitCounts, CALENDAR_COUNT_KEYS))
	};
}
