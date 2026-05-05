import { describe, expect, it } from 'vitest';
import { buildDutyRosterPreviewReviewModel } from './dutyRosterPreviewReview';
import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';

describe('dutyRosterPreviewReview', () => {
	it('shapes preview rows with generated, manual, warning, and form-payload state', () => {
		const preview = previewSnapshot();
		const model = buildDutyRosterPreviewReviewModel({
			preview,
			selectedAssigneeIds: { '2026-06-02': 'person-3' }
		});

		expect(model.previewPayload).toBe(JSON.stringify(preview));
		expect(model.selectionOptions).toEqual([
			{ value: 'person-1', label: 'SGT Able, Ann', description: 'Alpha' },
			{ value: 'person-2', label: 'CPL Baker, Ben', description: 'Bravo' },
			{ value: 'person-3', label: 'SPC Cross, Cy', description: 'Charlie' }
		]);
		expect(model.rows).toMatchObject([
			{
				date: '2026-06-01',
				editAssigneeId: 'person-2',
				finalAssignee: { id: 'person-2', lastName: 'Baker' },
				generatedAssignee: { id: 'person-1', lastName: 'Able' },
				manualSelection: {
					assigneeId: 'person-2',
					reason: 'Commander approved outside-pool replacement.'
				},
				liveWarnings: ['Selected Soldier is outside this template pool.']
			},
			{
				date: '2026-06-02',
				editAssigneeId: 'person-3',
				finalAssignee: null,
				unfilledReason: 'No eligible personnel available',
				liveWarnings: ['Selected Soldier is outside this template pool.', 'No eligible personnel available']
			}
		]);
	});

	it('shapes DA6 matrix cells without leaking raw cell rules to the view', () => {
		const model = buildDutyRosterPreviewReviewModel({ preview: previewSnapshot() });

		expect(model.matrix.columns).toEqual([
			expect.objectContaining({ date: '2026-06-01' }),
			expect.objectContaining({ date: '2026-06-02' })
		]);
		expect(model.matrix.rows).toEqual([
			{
				personnelId: 'person-1',
				soldierLabel: 'SGT Able',
				cells: [
					{ date: '2026-06-01', assigned: true, display: '1' },
					{ date: '2026-06-02', assigned: false, display: 'A' }
				]
			}
		]);
	});
});

function previewSnapshot(): DutyRosterTemplatePreview {
	const personnel = [
		previewPerson('person-1', 'SGT', 'Able', 'Ann', 'Alpha'),
		previewPerson('person-2', 'CPL', 'Baker', 'Ben', 'Bravo'),
		previewPerson('person-3', 'SPC', 'Cross', 'Cy', 'Charlie')
	];

	return {
		generatedAt: '2026-05-04T00:00:00Z',
		assignmentType: {
			id: 'template-1',
			name: 'CQ NCO',
			shortName: 'CQ',
			color: '#c47f00'
		},
		config: {
			startDate: '2026-06-01',
			endDate: '2026-06-02',
			dutyDuration: 'daily',
			excludedStatusIds: [],
			excludeWeekends: false,
			excludeHolidays: false,
			excludeOrgClosures: false,
			exemptPersonnelIds: [],
			numberingMode: 'single-sequence',
			misconductUnavailablePersonnelDates: {}
		},
		personnel: [personnel[0]!],
		selectionPersonnel: personnel,
		manualSelections: [
			{
				date: '2026-06-01',
				originalAssigneeId: 'person-1',
				assigneeId: 'person-2',
				reason: 'Commander approved outside-pool replacement.',
				warnings: [
					{
						code: 'outside-pool',
						message: 'Selected Soldier is outside this template pool.'
					}
				]
			}
		],
		rosterRows: [
			{ date: '2026-06-01', assigneeId: 'person-1' },
			{ date: '2026-06-02', assigneeId: null, reason: 'No eligible personnel available' }
		],
		da6: {
			numberingMode: 'single-sequence',
			columns: [
				{
					date: '2026-06-01',
					sequenceKind: 'weekday',
					sequenceKey: 'single',
					specialDayIds: [],
					chargeSequenceStart: 1,
					chargeableCount: 1
				},
				{
					date: '2026-06-02',
					sequenceKind: 'weekday',
					sequenceKey: 'single',
					specialDayIds: [],
					chargeSequenceStart: null,
					chargeableCount: 0
				}
			],
			rows: [
				{
					personnelId: 'person-1',
					display: {
						id: 'person-1',
						rank: 'SGT',
						lastName: 'Able',
						firstName: 'Ann',
						groupId: 'alpha',
						groupName: 'Alpha'
					},
					cells: [
						{
							date: '2026-06-01',
							personnelId: 'person-1',
							code: 'assigned',
							da6Code: null,
							chargeable: true,
							queuePosition: 1,
							sequenceNumber: 1,
							assigned: true,
							reason: null,
							reasonCode: null
						},
						{
							date: '2026-06-02',
							personnelId: 'person-1',
							code: 'authorized-absence',
							da6Code: 'A',
							chargeable: false,
							queuePosition: null,
							sequenceNumber: null,
							assigned: false,
							reason: 'Authorized absence: Leave',
							reasonCode: 'authorized-absence'
						}
					]
				}
			]
		},
		exportModel: {
			assignmentType: {
				id: 'template-1',
				name: 'CQ NCO',
				shortName: 'CQ',
				color: '#c47f00'
			},
			startDate: '2026-06-01',
			endDate: '2026-06-02',
			numberingMode: 'single-sequence',
			rosterRows: [],
			da6: {
				numberingMode: 'single-sequence',
				columns: [],
				rows: []
			},
			sequencePeriods: []
		},
		warnings: []
	};
}

function previewPerson(id: string, rank: string, lastName: string, firstName: string, groupName: string) {
	return {
		id,
		rank,
		lastName,
		firstName,
		groupId: groupName.toLowerCase(),
		groupName,
		archivedAt: null
	};
}
