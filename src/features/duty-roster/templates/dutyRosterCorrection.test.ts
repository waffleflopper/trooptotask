import { describe, expect, it } from 'vitest';
import {
	applyDutyRosterCorrectionsToSnapshot,
	dutyRosterCorrectionCountsTowardFuture,
	effectiveDutyRosterAssigneeId,
	latestDutyRosterCorrectionsByDate
} from './dutyRosterCorrection';
import type { DutyRosterTemplateAcceptedSnapshot } from './dutyRosterTemplatePreview';

describe('Duty Roster Correction', () => {
	it('uses the latest Duty Roster Correction as the effective Soldier for a row', () => {
		const corrections = [
			{ runRowDate: '2026-06-01', replacementAssigneeId: 'bravo', reason: 'First swap.' },
			{ runRowDate: '2026-06-01', replacementAssigneeId: 'charlie', reason: 'Latest swap.' }
		];

		expect(latestDutyRosterCorrectionsByDate(corrections).get('2026-06-01')).toMatchObject({
			replacementAssigneeId: 'charlie'
		});
		expect(
			effectiveDutyRosterAssigneeId({
				runRowDate: '2026-06-01',
				acceptedAssigneeId: 'alpha',
				corrections
			})
		).toBe('charlie');
	});

	it('keeps accepted and invalidated future-count behavior explicit', () => {
		expect(dutyRosterCorrectionCountsTowardFuture({ runStatus: 'accepted' })).toBe(true);
		expect(dutyRosterCorrectionCountsTowardFuture({ runStatus: 'invalidated' })).toBe(false);
	});

	it('applies Duty Roster Corrections to the Run Snapshot used for future counts', () => {
		const corrected = applyDutyRosterCorrectionsToSnapshot(snapshot(), [
			{ runRowDate: '2026-06-01', replacementAssigneeId: 'bravo', reason: 'Soldier performed duty.' }
		]);

		expect(corrected.finalRows[0]).toMatchObject({
			finalAssigneeId: 'bravo',
			finalDisplay: expect.objectContaining({ lastName: 'Baker' }),
			reason: 'Soldier performed duty.'
		});
	});
});

function snapshot(): DutyRosterTemplateAcceptedSnapshot {
	return {
		snapshotVersion: 1,
		template: { id: 'assignment-type-1', name: 'CQ NCO', shortCode: 'CQ' },
		generatedAt: '2026-06-01T00:00:00.000Z',
		acceptedAt: '2026-06-01T00:00:00.000Z',
		acceptedByUserId: 'user-1',
		config: {
			startDate: '2026-06-01',
			endDate: '2026-06-01',
			dutyDuration: 'daily',
			excludedStatusIds: [],
			excludeWeekends: false,
			excludeHolidays: false,
			excludeOrgClosures: false,
			exemptPersonnelIds: [],
			numberingMode: 'single-sequence',
			misconductUnavailablePersonnelDates: {}
		},
		resolvedPool: [],
		selectionPersonnel: [
			{
				id: 'alpha',
				rank: 'SGT',
				lastName: 'Able',
				firstName: 'Ann',
				groupId: 'group-1',
				groupName: 'Alpha',
				archivedAt: null
			},
			{
				id: 'bravo',
				rank: 'SGT',
				lastName: 'Baker',
				firstName: 'Ben',
				groupId: 'group-1',
				groupName: 'Alpha',
				archivedAt: null
			}
		],
		generatedRows: [{ date: '2026-06-01', assigneeId: 'alpha' }],
		finalRows: [
			{
				date: '2026-06-01',
				generatedAssigneeId: 'alpha',
				finalAssigneeId: 'alpha',
				assignmentSource: 'generated',
				generatedDisplay: {
					id: 'alpha',
					rank: 'SGT',
					lastName: 'Able',
					firstName: 'Ann',
					groupId: 'group-1',
					groupName: 'Alpha',
					archivedAt: null
				},
				finalDisplay: {
					id: 'alpha',
					rank: 'SGT',
					lastName: 'Able',
					firstName: 'Ann',
					groupId: 'group-1',
					groupName: 'Alpha',
					archivedAt: null
				},
				reason: null,
				warnings: []
			}
		],
		manualSelections: [],
		da6: { numberingMode: 'single-sequence', columns: [], rows: [] },
		exportModel: {
			assignmentType: { id: 'assignment-type-1', name: 'CQ NCO', shortName: 'CQ', color: '#8a5a22' },
			startDate: '2026-06-01',
			endDate: '2026-06-01',
			numberingMode: 'single-sequence',
			rosterRows: [{ date: '2026-06-01', assigneeId: 'alpha' }],
			da6: { numberingMode: 'single-sequence', columns: [], rows: [] },
			sequencePeriods: []
		},
		warnings: []
	};
}
