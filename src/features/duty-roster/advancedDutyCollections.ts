import type { DutyEvent, DutyTemplate } from './duty-roster.types';
import { cloneDefaultSoftPreferences } from './duty-roster.types';

function byNewestCoverageStart(a: DutyEvent, b: DutyEvent): number {
	return b.coverageStart.localeCompare(a.coverageStart);
}

export function sortDutyTemplates(items: DutyTemplate[]): DutyTemplate[] {
	return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeDutyTemplate(template: DutyTemplate): DutyTemplate {
	return {
		...template,
		scopeGroupIds: Array.isArray(template.scopeGroupIds) ? template.scopeGroupIds : [],
		exemptPersonnelIds: Array.isArray(template.exemptPersonnelIds) ? template.exemptPersonnelIds : [],
		exemptStatusTypeIds: Array.isArray(template.exemptStatusTypeIds) ? template.exemptStatusTypeIds : [],
		softPreferences:
			Array.isArray(template.softPreferences) && template.softPreferences.length > 0
				? template.softPreferences
				: cloneDefaultSoftPreferences(),
		slots: Array.isArray(template.slots) ? template.slots : [],
		rotationBaselines: Array.isArray(template.rotationBaselines) ? template.rotationBaselines : []
	};
}

export function normalizeDutyTemplates(items: DutyTemplate[]): DutyTemplate[] {
	return sortDutyTemplates(items.map(normalizeDutyTemplate));
}

export function sortDutyEventsByCoverageStart(items: DutyEvent[]): DutyEvent[] {
	return [...items].sort(byNewestCoverageStart);
}

export function upsertDutyEventIntoTimeline(existing: DutyEvent[], event: DutyEvent): DutyEvent[] {
	return [event, ...existing.filter((item) => item.id !== event.id)].sort(byNewestCoverageStart);
}

export function mergeDutyEventsIntoTimeline(existing: DutyEvent[], incoming: DutyEvent[]): DutyEvent[] {
	const incomingIds = new Set(incoming.map((event) => event.id));
	return [...incoming, ...existing.filter((event) => !incomingIds.has(event.id))].sort(byNewestCoverageStart);
}

export function removeDutyEventsById(existing: DutyEvent[], dutyEventId: string): DutyEvent[] {
	return existing.filter((event) => event.id !== dutyEventId);
}

export function removeDutyEventsByRunId(existing: DutyEvent[], runId: string): DutyEvent[] {
	return existing.filter((event) => event.runId !== runId);
}

export function removeLegacyDutyEvents(existing: DutyEvent[], eventIds: string[]): DutyEvent[] {
	const removed = new Set(eventIds);
	return existing.filter((event) => !removed.has(event.id));
}
