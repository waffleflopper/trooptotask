import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { readUnitCounts } from '$features/organization/index.server';
import {
	CALENDAR_COUNT_KEYS,
	type GeneralSettingsData,
	type GeneralSettingsOrganization,
	type LastRenamed
} from '$features/organization/contracts';
import { canReadAuditLog, type SettingsUnitSummaryPorts } from './settingsLoad.server';

/** The name and web address render on first paint; the last rename and the Calendar counts stream. */
export function loadGeneralSettings(
	ports: SettingsUnitSummaryPorts,
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
