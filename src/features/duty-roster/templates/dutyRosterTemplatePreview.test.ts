import { describe, expect, it } from 'vitest';
import {
	applyDutyRosterTemplateManualSelection,
	buildDutyRosterTemplateAcceptedSnapshot,
	buildDutyRosterTemplatePreview,
	manualSelectionForDate,
	previewFinalAssigneeId,
	reviewDutyRosterTemplateManualSelection
} from './dutyRosterTemplatePreview';
import { buildDutyRosterCountSource } from './dutyRosterCountSource';
import type { DutyRosterPoolPersonnel, DutyRosterTemplate } from './dutyRosterTemplates';
import type { StatusType } from '$lib/types';

const statusTypes: StatusType[] = [
	{
		id: 'leave',
		name: 'Leave',
		color: '#48bb78',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'authorized-absence',
		da6TreatmentReviewed: true
	},
	{
		id: 'other-duty',
		name: 'Other Duty',
		color: '#a0522d',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'other-duty',
		da6TreatmentReviewed: true
	},
	{
		id: 'misconduct',
		name: 'Misconduct',
		color: '#991b1b',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'misconduct-unavailable',
		da6TreatmentReviewed: true
	}
];

const template: DutyRosterTemplate = {
	id: 'template-1',
	assignmentTypeId: 'assignment-type-1',
	name: 'CQ NCO',
	slug: 'cq-nco',
	shortCode: 'CQ',
	status: 'active',
	poolCriteria: {
		rankValues: [],
		groupIds: [],
		mosValues: [],
		dutyRoleValues: []
	},
	exemptPersonnelIds: [],
	manualBaselineCounts: {},
	createdAt: '2026-05-04T00:00:00.000Z',
	updatedAt: '2026-05-04T00:00:00.000Z'
};

function person(overrides: Partial<DutyRosterPoolPersonnel>): DutyRosterPoolPersonnel {
	return {
		id: overrides.id ?? 'person',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Soldier',
		firstName: overrides.firstName ?? 'Sam',
		mos: overrides.mos ?? '11B',
		dutyRole: overrides.dutyRole ?? 'Rifleman',
		groupId: overrides.groupId ?? 'alpha',
		groupName: overrides.groupName ?? 'Alpha',
		archivedAt: overrides.archivedAt ?? null
	};
}

describe('buildDutyRosterTemplatePreview', () => {
	it('starts a new roster from DA6 roster order when there is no baseline or accepted history', () => {
		const preview = buildDutyRosterTemplatePreview({
			template,
			personnel: [
				person({ id: 'junior', rank: 'SPC', lastName: 'Able' }),
				person({ id: 'senior-b', rank: 'SSG', lastName: 'Baker' }),
				person({ id: 'senior-a', rank: 'SSG', lastName: 'Able' })
			],
			availabilityEntries: [],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-03'
		});

		expect(preview.da6.rows.map((row) => row.personnelId)).toEqual(['senior-a', 'senior-b', 'junior']);
		expect(preview.rosterRows.map((row) => row.assigneeId)).toEqual(['senior-a', 'senior-b', 'junior']);
	});

	it('uses Manual DA6 Baseline counts as first-use setup data for longest-break ranking', () => {
		const personnel = [
			person({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
			person({ id: 'bravo', rank: 'SGT', lastName: 'Baker' }),
			person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' })
		];
		const templateWithBaseline = {
			...template,
			manualBaselineCounts: {
				alpha: 3,
				bravo: 0,
				charlie: 1
			}
		};
		const countSource = buildDutyRosterCountSource({
			template: templateWithBaseline,
			resolvedPool: personnel,
			runs: [],
			baselineStartDate: '2026-06-01'
		});
		const preview = buildDutyRosterTemplatePreview({
			template: templateWithBaseline,
			personnel,
			availabilityEntries: [],
			statusTypes,
			specialDays: [],
			continuationHistory: countSource.continuationHistory,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		expect(preview.rosterRows[0].assigneeId).toBe('alpha');
	});

	it('selects the highest Manual DA6 Baseline count before roster-order tie breaking', () => {
		const personnel = [
			person({ id: 'chen', rank: 'SPC', lastName: 'Chen' }),
			person({ id: 'ramsey', rank: 'SPC', lastName: 'Ramsey' }),
			person({ id: 'rivera', rank: 'SPC', lastName: 'Rivera' })
		];
		const templateWithBaseline = {
			...template,
			manualBaselineCounts: {
				chen: 3,
				ramsey: 38,
				rivera: 38
			}
		};
		const countSource = buildDutyRosterCountSource({
			template: templateWithBaseline,
			resolvedPool: personnel,
			runs: [],
			baselineStartDate: '2026-06-01'
		});
		const preview = buildDutyRosterTemplatePreview({
			template: templateWithBaseline,
			personnel,
			availabilityEntries: [],
			statusTypes,
			specialDays: [],
			continuationHistory: countSource.continuationHistory,
			startDate: '2026-06-01',
			endDate: '2026-06-02'
		});

		expect(preview.rosterRows.map((row) => row.assigneeId)).toEqual(['ramsey', 'rivera']);
		expect(preview.da6.rows.map((row) => row.cells.map((cell) => cell.sequenceNumber))).toEqual([
			[3, 4],
			[38, 1],
			[38, 39]
		]);
	});

	it('keeps preview generation read-only while showing A, D, and future U matrix markings', () => {
		const preview = buildDutyRosterTemplatePreview({
			template,
			personnel: [
				person({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
				person({ id: 'bravo', rank: 'SGT', lastName: 'Baker' }),
				person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' }),
				person({ id: 'delta', rank: 'SGT', lastName: 'Delta' })
			],
			availabilityEntries: [
				{
					id: 'leave-alpha',
					personnelId: 'alpha',
					statusTypeId: 'leave',
					startDate: '2026-06-01',
					endDate: '2026-06-01'
				},
				{
					id: 'detail-bravo',
					personnelId: 'bravo',
					statusTypeId: 'other-duty',
					startDate: '2026-06-01',
					endDate: '2026-06-01'
				},
				{
					id: 'misconduct-charlie',
					personnelId: 'charlie',
					statusTypeId: 'misconduct',
					startDate: '2026-06-01',
					endDate: '2026-06-01'
				}
			],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		expect(preview.rosterRows[0].assigneeId).toBe('delta');
		expect(preview.da6.rows.map((row) => row.cells[0].da6Code)).toEqual(['A', 'D', 'U', null]);
		expect(Object.isFrozen(preview)).toBe(true);
	});

	it('applies clean manual selections without requiring a reason while preserving the generated Soldier', () => {
		const preview = buildDutyRosterTemplatePreview({
			template,
			personnel: [
				person({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
				person({ id: 'bravo', rank: 'SGT', lastName: 'Baker' })
			],
			availabilityEntries: [],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		const updated = applyDutyRosterTemplateManualSelection(preview, {
			date: '2026-06-01',
			assigneeId: 'bravo'
		});

		expect(preview.rosterRows[0].assigneeId).toBe('alpha');
		expect(previewFinalAssigneeId(updated, '2026-06-01')).toBe('bravo');
		expect(manualSelectionForDate(updated, '2026-06-01')).toMatchObject({
			originalAssigneeId: 'alpha',
			assigneeId: 'bravo',
			reason: null,
			warnings: []
		});
		expect(Object.isFrozen(updated)).toBe(true);
	});

	it('builds accepted DA6 and export output from final manual selections', () => {
		const preview = buildDutyRosterTemplatePreview({
			template,
			personnel: [
				person({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
				person({ id: 'bravo', rank: 'SGT', lastName: 'Baker' })
			],
			availabilityEntries: [],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const updated = applyDutyRosterTemplateManualSelection(preview, {
			date: '2026-06-01',
			assigneeId: 'bravo'
		});

		const snapshot = buildDutyRosterTemplateAcceptedSnapshot({
			preview: updated,
			acceptedAt: '2026-06-01T12:00:00.000Z',
			acceptedByUserId: 'user-1'
		});

		expect(snapshot.finalRows[0]).toMatchObject({
			generatedAssigneeId: 'alpha',
			finalAssigneeId: 'bravo',
			assignmentSource: 'manual'
		});
		expect(snapshot.da6.rows.map((row) => row.cells[0].assigned)).toEqual([false, true]);
		expect(snapshot.da6.rows.map((row) => row.cells[0].code)).toEqual(['available-not-selected', 'assigned']);
		expect(snapshot.exportModel.rosterRows).toEqual([{ date: '2026-06-01', assigneeId: 'bravo' }]);
		expect(snapshot.exportModel.da6.rows.map((row) => row.cells[0].assigned)).toEqual([false, true]);
	});

	it('hard-blocks missing or archived Personnel Records from manual selections', () => {
		const preview = buildDutyRosterTemplatePreview({
			template,
			personnel: [
				person({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
				person({ id: 'archived', rank: 'SGT', lastName: 'Archived', archivedAt: '2026-05-01T00:00:00Z' })
			],
			availabilityEntries: [],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		expect(() =>
			applyDutyRosterTemplateManualSelection(preview, {
				date: '2026-06-01',
				assigneeId: 'missing'
			})
		).toThrow('Selected Soldier is missing or archived.');
		expect(() =>
			applyDutyRosterTemplateManualSelection(preview, {
				date: '2026-06-01',
				assigneeId: 'archived'
			})
		).toThrow('Selected Soldier is missing or archived.');
	});

	it('requires reasons for outside-pool or unavailable manual selections and keeps warnings with the preview', () => {
		const preview = buildDutyRosterTemplatePreview({
			template: {
				...template,
				poolCriteria: {
					...template.poolCriteria,
					groupIds: ['alpha']
				}
			},
			personnel: [
				person({ id: 'alpha', rank: 'SGT', lastName: 'Able', groupId: 'alpha' }),
				person({ id: 'bravo', rank: 'SGT', lastName: 'Baker', groupId: 'alpha' }),
				person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie', groupId: 'bravo' })
			],
			availabilityEntries: [
				{
					id: 'detail-bravo',
					personnelId: 'bravo',
					statusTypeId: 'other-duty',
					startDate: '2026-06-01',
					endDate: '2026-06-01'
				}
			],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		expect(() =>
			applyDutyRosterTemplateManualSelection(preview, {
				date: '2026-06-01',
				assigneeId: 'bravo'
			})
		).toThrow('A reason is required for this manual selection.');
		expect(() =>
			applyDutyRosterTemplateManualSelection(preview, {
				date: '2026-06-01',
				assigneeId: 'charlie'
			})
		).toThrow('A reason is required for this manual selection.');

		const unavailable = applyDutyRosterTemplateManualSelection(preview, {
			date: '2026-06-01',
			assigneeId: 'bravo',
			reason: 'Leader approved after review.'
		});
		expect(manualSelectionForDate(unavailable, '2026-06-01')?.warnings).toEqual([
			{
				code: 'unavailable-or-conflicting',
				message: 'Other duty: Other Duty'
			}
		]);

		const outsidePool = applyDutyRosterTemplateManualSelection(preview, {
			date: '2026-06-01',
			assigneeId: 'charlie',
			reason: 'Commander selected a replacement outside the usual pool.'
		});
		expect(manualSelectionForDate(outsidePool, '2026-06-01')?.warnings).toEqual([
			{
				code: 'outside-pool',
				message: 'Selected Soldier is outside this template pool.'
			}
		]);
	});

	it('reviews manual selection warnings from the selected Soldier DA6 cell', () => {
		const preview = buildDutyRosterTemplatePreview({
			template,
			personnel: [
				person({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
				person({ id: 'bravo', rank: 'SGT', lastName: 'Baker' }),
				person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' })
			],
			availabilityEntries: [
				{
					id: 'detail-bravo',
					personnelId: 'bravo',
					statusTypeId: 'other-duty',
					startDate: '2026-06-01',
					endDate: '2026-06-01'
				}
			],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		const cleanReview = reviewDutyRosterTemplateManualSelection(preview, {
			date: '2026-06-01',
			assigneeId: 'charlie'
		});
		expect(cleanReview).toMatchObject({
			blockedReason: null,
			reasonRequired: false,
			warnings: []
		});

		const unavailableReview = reviewDutyRosterTemplateManualSelection(preview, {
			date: '2026-06-01',
			assigneeId: 'bravo'
		});
		expect(unavailableReview).toMatchObject({
			blockedReason: null,
			reasonRequired: true,
			warnings: [
				{
					code: 'unavailable-or-conflicting',
					message: 'Other duty: Other Duty'
				}
			]
		});
	});
});
