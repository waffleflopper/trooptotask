import { describe, expect, it } from 'vitest';
import type { DutyEvent, DutyTemplate } from './duty-roster.types';
import {
	mergeDutyEventsIntoTimeline,
	normalizeDutyTemplate,
	removeDutyEventsById,
	removeDutyEventsByRunId,
	removeLegacyDutyEvents,
	sortDutyTemplates,
	stableSnapshotInput,
	upsertDutyEventIntoTimeline
} from './advancedDutyCollections';

function makeTemplate(overrides: Partial<DutyTemplate> = {}): DutyTemplate {
	return {
		id: 'template-1',
		orgId: 'org-1',
		mode: 'advanced',
		status: 'active',
		name: 'Staff Duty',
		description: null,
		scopeType: 'organization',
		scopeGroupIds: [],
		exemptPersonnelIds: [],
		exemptStatusTypeIds: [],
		coverageMode: 'timed',
		startTime: '08:00',
		endTime: '08:00',
		spansMidnight: false,
		isBlocking: true,
		cooldownHours: 24,
		softPreferences: [],
		slots: [],
		rotationBaselines: [],
		createdAt: '2026-04-01T00:00:00.000Z',
		updatedAt: '2026-04-01T00:00:00.000Z',
		...overrides
	};
}

function makeEvent(id: string, coverageStart: string, runId: string | null = 'run-1'): DutyEvent {
	return {
		id,
		orgId: 'org-1',
		runId,
		templateId: 'template-1',
		templateName: 'Staff Duty',
		eventDate: coverageStart.slice(0, 10),
		coverageMode: 'timed',
		coverageStart,
		coverageEnd: '2026-04-02T08:00:00',
		isBlocking: true,
		cooldownHours: 24,
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		rulesSnapshot: {
			templateId: 'template-1',
			templateName: 'Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			scopeType: 'organization',
			scopeGroupIds: [],
			isBlocking: true,
			cooldownHours: 24,
			softPreferences: [],
			slots: []
		},
		slotInstances: [],
		createdAt: '2026-04-01T00:00:00.000Z',
		updatedAt: '2026-04-01T00:00:00.000Z'
	};
}

describe('advancedDutyCollections', () => {
	it('builds stable snapshot input keys without dropping nested override fields', () => {
		const first = stableSnapshotInput({
			templateId: 'template-1',
			eventOverrides: [
				{
					eventDate: '2026-05-05',
					slotOverrides: [{ slotIndex: 0, assigneeId: 'person-1' }]
				}
			]
		});
		const second = stableSnapshotInput({
			templateId: 'template-1',
			eventOverrides: [
				{
					eventDate: '2026-05-05',
					slotOverrides: [{ slotIndex: 0, assigneeId: 'person-2' }]
				}
			]
		});

		expect(first).toContain('person-1');
		expect(second).toContain('person-2');
		expect(first).not.toBe(second);
	});

	it('builds identical snapshot input keys for equivalent nested objects with different key order', () => {
		expect(
			stableSnapshotInput({
				templateId: 'template-1',
				eventOverrides: [
					{
						eventDate: '2026-05-05',
						slotOverrides: [{ assigneeId: 'person-1', slotIndex: 0 }]
					}
				]
			})
		).toBe(
			stableSnapshotInput({
				eventOverrides: [
					{
						slotOverrides: [{ slotIndex: 0, assigneeId: 'person-1' }],
						eventDate: '2026-05-05'
					}
				],
				templateId: 'template-1'
			})
		);
	});

	it('normalizes optional template arrays and default soft preferences', () => {
		const template = normalizeDutyTemplate({
			...makeTemplate(),
			scopeGroupIds: undefined,
			exemptPersonnelIds: undefined,
			exemptStatusTypeIds: undefined,
			softPreferences: [],
			slots: undefined,
			rotationBaselines: undefined
		} as unknown as DutyTemplate);

		expect(template.scopeGroupIds).toEqual([]);
		expect(template.exemptPersonnelIds).toEqual([]);
		expect(template.exemptStatusTypeIds).toEqual([]);
		expect(template.softPreferences.map((preference) => preference.type)).toEqual([
			'longest-break',
			'separate-weekend-da6',
			'include-holiday-donsa-da6'
		]);
		expect(template.slots).toEqual([]);
		expect(template.rotationBaselines).toEqual([]);
	});

	it('sorts templates by display name', () => {
		expect(
			sortDutyTemplates([makeTemplate({ name: 'Zulu' }), makeTemplate({ id: 'template-2', name: 'Alpha' })]).map(
				(template) => template.name
			)
		).toEqual(['Alpha', 'Zulu']);
	});

	it('keeps advanced duty events newest first when upserting one event', () => {
		const events = [makeEvent('older', '2026-04-01T08:00:00'), makeEvent('existing', '2026-04-03T08:00:00')];

		const next = upsertDutyEventIntoTimeline(events, makeEvent('existing', '2026-04-05T08:00:00'));

		expect(next.map((event) => event.id)).toEqual(['existing', 'older']);
		expect(next[0].coverageStart).toBe('2026-04-05T08:00:00');
	});

	it('merges applied series events and removes deleted event groups', () => {
		const events = [
			makeEvent('existing-run-event', '2026-04-01T08:00:00', 'run-old'),
			makeEvent('legacy-event', '2026-04-02T08:00:00', null)
		];

		const merged = mergeDutyEventsIntoTimeline(events, [
			makeEvent('series-1', '2026-04-05T08:00:00', 'run-new'),
			makeEvent('series-2', '2026-04-04T08:00:00', 'run-new')
		]);

		expect(merged.map((event) => event.id)).toEqual(['series-1', 'series-2', 'legacy-event', 'existing-run-event']);
		expect(removeDutyEventsByRunId(merged, 'run-new').map((event) => event.id)).toEqual([
			'legacy-event',
			'existing-run-event'
		]);
		expect(removeLegacyDutyEvents(merged, ['legacy-event']).map((event) => event.id)).toEqual([
			'series-1',
			'series-2',
			'existing-run-event'
		]);
		expect(removeDutyEventsById(merged, 'series-1').map((event) => event.id)).toEqual([
			'series-2',
			'legacy-event',
			'existing-run-event'
		]);
	});
});
