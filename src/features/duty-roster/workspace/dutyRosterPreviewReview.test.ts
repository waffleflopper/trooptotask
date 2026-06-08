import { describe, expect, it } from 'vitest';
import { buildDa6MatrixDisplay } from '$features/duty-roster/components/shared';
import { buildDutyRosterAcceptedRunReviewModel, buildDutyRosterPreviewReviewModel } from './dutyRosterPreviewReview';
import type {
	DutyRosterTemplateAcceptedSnapshot,
	DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import type { DutyRosterTemplateAcceptedRun } from '$features/duty-roster/templates/dutyRosterTemplates';

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
				liveWarnings: ['Selected Soldier is outside this template pool.']
			}
		]);
	});

	it('uses selected Soldier review warnings instead of the generated row reason', () => {
		const preview = previewSnapshot();
		preview.da6.rows.push({
			personnelId: 'person-3',
			display: {
				id: 'person-3',
				rank: 'SPC',
				lastName: 'Cross',
				firstName: 'Cy',
				groupId: 'charlie',
				groupName: 'Charlie'
			},
			cells: [
				{
					date: '2026-06-01',
					personnelId: 'person-3',
					code: 'blocked-by-duty',
					da6Code: 'D',
					chargeable: true,
					queuePosition: 2,
					sequenceNumber: 2,
					assigned: false,
					reason: 'Other duty: Staff Duty',
					reasonCode: 'other-duty-status'
				},
				{
					date: '2026-06-02',
					personnelId: 'person-3',
					code: 'available-not-selected',
					da6Code: null,
					chargeable: true,
					queuePosition: 1,
					sequenceNumber: 1,
					assigned: false,
					reason: null,
					reasonCode: null
				}
			]
		});
		preview.rosterRows[1] = {
			date: '2026-06-02',
			assigneeId: null,
			reason: 'No eligible personnel available'
		};

		const model = buildDutyRosterPreviewReviewModel({
			preview,
			selectedAssigneeIds: { '2026-06-02': 'person-3' }
		});

		expect(model.rows[1]?.liveWarnings).toEqual(['Selected Soldier is outside this template pool.']);
		expect(model.da6Matrix.rows.find((row) => row.personnelId === 'person-3')?.cells[0]).toMatchObject({
			date: '2026-06-01',
			personnelId: 'person-3',
			code: 'blocked-by-duty',
			da6Code: 'D',
			assigned: false,
			chargeable: true,
			queuePosition: 2,
			sequenceNumber: 2,
			reason: 'Other duty: Staff Duty',
			reasonCode: 'other-duty-status'
		});
	});

	it('builds the draft DA6 matrix from final manual selections without renumbering', () => {
		const preview = previewSnapshot();
		const model = buildDutyRosterPreviewReviewModel({ preview });

		expect(model.da6Matrix.columns).toEqual([
			expect.objectContaining({ date: '2026-06-01' }),
			expect.objectContaining({ date: '2026-06-02' })
		]);
		expect(model.da6Matrix.rows.map((row) => row.personnelId)).toEqual(['person-1', 'person-2']);
		expect(model.da6Matrix.rows[0]?.cells[0]).toMatchObject({
			personnelId: 'person-1',
			date: '2026-06-01',
			assigned: false,
			code: 'available-not-selected',
			sequenceNumber: 1
		});
		expect(model.da6Matrix.rows[1]?.cells[0]).toMatchObject({
			personnelId: 'person-2',
			date: '2026-06-01',
			assigned: true,
			code: 'assigned',
			da6Code: null,
			sequenceNumber: 1
		});
		expect(buildDa6MatrixDisplay(model.da6Matrix, 'draft').footerRows).toEqual([
			{
				label: 'Assigned Count',
				values: { '2026-06-01': 1, '2026-06-02': 0 }
			},
			{
				label: 'Required Count',
				values: { '2026-06-01': 1, '2026-06-02': 0 }
			}
		]);
	});

	it('shapes accepted history rows from the saved snapshot and latest correction', () => {
		const model = buildDutyRosterAcceptedRunReviewModel({
			run: acceptedRun(),
			todayDate: '2026-06-01'
		});

		expect(model.snapshot.finalRows[0]?.finalAssigneeId).toBe('person-1');
		expect(model.canInvalidate).toBe(true);
		expect(model.calendarState).toBe('apply');
		expect(model.calendarStepLabel).toBe('Not applied');
		expect(model.rows).toMatchObject([
			{
				id: 'run-1:2026-06-01',
				date: '2026-06-01',
				sourceLabel: 'CORRECTED',
				reviewText: 'Corrected',
				correction: {
					replacementAssigneeId: 'person-2',
					reason: 'Duty swap memo'
				},
				correctionSummary: {
					replacementName: 'SGT Baker, Ben',
					originalName: 'SGT Able, Ann',
					reason: 'Duty swap memo',
					countText: 'Counts toward future DA6 runs.',
					overrideText: null
				},
				canCorrect: true,
				correctionOptions: [{ value: 'person-2', label: 'SGT Baker, Ben', description: 'Alpha' }],
				correctionOverrideWarnings: {}
			}
		]);
	});

	it('marks out-of-pool correction options and summaries as overrides', () => {
		const run = acceptedRun({ poolOverride: true });
		const model = buildDutyRosterAcceptedRunReviewModel({
			run,
			todayDate: '2026-06-01'
		});

		expect(model.rows[0]).toMatchObject({
			correctionSummary: {
				overrideText: 'Outside normal pool. Saved as an override.'
			},
			correctionOverrideWarnings: {
				'person-2': 'Outside normal pool. Saved as an override.'
			}
		});
	});

	it('marks only changed accepted-history rows as needing Calendar sync', () => {
		const run = acceptedRun();
		const snapshot = run.snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
		snapshot.finalRows.push({
			date: '2026-06-02',
			generatedAssigneeId: 'person-2',
			finalAssigneeId: 'person-2',
			assignmentSource: 'generated',
			generatedDisplay: previewPerson('person-2', 'SGT', 'Baker', 'Ben', 'Alpha'),
			finalDisplay: previewPerson('person-2', 'SGT', 'Baker', 'Ben', 'Alpha'),
			reason: null,
			warnings: []
		});
		run.appliedAt = '2026-05-04T01:00:00Z';
		run.calendarAssignmentsEdited = true;
		run.calendarSyncState = {
			status: 'calendar-manually-changed',
			label: 'Calendar was manually changed',
			summary: '1 linked Calendar assignment differs from this accepted run. Review before overwriting.',
			invalidationRemovalSummary: null,
			plan: {
				token: 'plan-1',
				changes: [
					{
						id: 'run-1:2026-06-02',
						date: '2026-06-02',
						sourceRowKey: '2026-06-02',
						assignmentTypeId: 'template-1',
						action: 'update',
						currentAssignmentTypeId: 'template-1',
						currentAssigneeId: 'person-1',
						currentAssigneeLabel: 'SGT Able, Ann',
						currentSourceLineage: {
							sourceKind: 'duty-roster-run',
							sourceId: 'run-1',
							sourceRowKey: '2026-06-02'
						},
						plannedAssigneeId: 'person-2',
						plannedAssigneeLabel: 'SGT Baker, Ben',
						reason: 'Accepted Duty Roster Run assignment',
						correctionReason: null
					}
				]
			}
		};

		const model = buildDutyRosterAcceptedRunReviewModel({ run });

		expect(model.calendarStepLabel).toBe('Needs sync');
		expect(model.rows.map((row) => ({ date: row.date, calendarStepLabel: row.calendarStepLabel }))).toEqual([
			{ date: '2026-06-01', calendarStepLabel: 'Applied' },
			{ date: '2026-06-02', calendarStepLabel: 'Needs sync' }
		]);
	});

	it('shapes invalidated accepted history as locked non-counting review state', () => {
		const model = buildDutyRosterAcceptedRunReviewModel({
			run: acceptedRun({ invalidated: true })
		});

		expect(model.canInvalidate).toBe(false);
		expect(model.calendarStepLabel).toBe('Closed');
		expect(model.rows[0]).toMatchObject({
			isInvalidated: true,
			calendarStepLabel: 'Closed',
			canCorrect: false,
			correctionLockedText: 'Correction trail is locked with this invalidated run.',
			correctionSummary: {
				countText: 'Non-counting because this run is invalidated.'
			}
		});
	});

	it('allows non-latest accepted history to be invalidated while its end date is today or later', () => {
		const model = buildDutyRosterAcceptedRunReviewModel({
			run: acceptedRun(),
			todayDate: '2026-06-01'
		});

		expect(model.canInvalidate).toBe(true);
		expect(model.invalidateDisabledReason).toBe(null);
	});

	it('blocks accepted history invalidation after the run end date', () => {
		const model = buildDutyRosterAcceptedRunReviewModel({
			run: acceptedRun(),
			todayDate: '2026-06-03'
		});

		expect(model.canInvalidate).toBe(false);
		expect(model.invalidateDisabledReason).toBe('Runs with end dates before today cannot be invalidated.');
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
			pattern: 'daily',
			selectedWeekdays: [],
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

function acceptedRun(options: { invalidated?: boolean; poolOverride?: boolean } = {}): DutyRosterTemplateAcceptedRun {
	return {
		id: 'run-1',
		templateId: 'template-1',
		templateName: 'CQ NCO',
		status: options.invalidated ? 'invalidated' : 'accepted',
		startDate: '2026-06-01',
		endDate: '2026-06-02',
		acceptedAt: '2026-05-04T00:00:00Z',
		acceptedByUserId: 'user-1',
		appliedAt: null,
		appliedByUserId: null,
		invalidatedAt: options.invalidated ? '2026-05-04T02:00:00Z' : null,
		invalidatedByUserId: options.invalidated ? 'user-1' : null,
		linkedCalendarAssignmentCount: 0,
		calendarAssignmentsEdited: false,
		corrections: [
			{
				id: 'correction-1',
				runId: 'run-1',
				runRowDate: '2026-06-01',
				originalAssigneeId: 'person-1',
				originalDisplay: display('person-1', 'Able', 'Ann'),
				replacementAssigneeId: 'person-2',
				replacementDisplay: display('person-2', 'Baker', 'Ben'),
				reason: 'Duty swap memo',
				correctedByUserId: 'user-1',
				correctedAt: '2026-05-04T01:00:00Z',
				countsTowardFuture: !options.invalidated,
				poolOverride: Boolean(options.poolOverride),
				poolOverrideReasons: options.poolOverride ? ['outside-pool'] : []
			}
		],
		snapshotPayload: acceptedSnapshotPayload({ poolOverride: Boolean(options.poolOverride) }) as unknown as Record<
			string,
			unknown
		>,
		createdAt: '2026-05-04T00:00:00Z'
	};
}

function acceptedSnapshotPayload(options: { poolOverride?: boolean } = {}): DutyRosterTemplateAcceptedSnapshot {
	return {
		snapshotVersion: 1,
		template: {
			id: 'template-1',
			name: 'CQ NCO',
			shortCode: 'CQ'
		},
		generatedAt: '2026-05-04T00:00:00Z',
		acceptedAt: '2026-05-04T00:00:00Z',
		acceptedByUserId: 'user-1',
		config: {
			startDate: '2026-06-01',
			endDate: '2026-06-02',
			dutyDuration: 'daily',
			pattern: 'daily',
			selectedWeekdays: [],
			excludedStatusIds: [],
			excludeWeekends: false,
			excludeHolidays: false,
			excludeOrgClosures: false,
			exemptPersonnelIds: [],
			numberingMode: 'single-sequence',
			misconductUnavailablePersonnelDates: {}
		},
		resolvedPool: options.poolOverride
			? [previewPerson('person-1', 'SGT', 'Able', 'Ann', 'Alpha')]
			: [
					previewPerson('person-1', 'SGT', 'Able', 'Ann', 'Alpha'),
					previewPerson('person-2', 'SGT', 'Baker', 'Ben', 'Alpha')
				],
		selectionPersonnel: [
			previewPerson('person-1', 'SGT', 'Able', 'Ann', 'Alpha'),
			previewPerson('person-2', 'SGT', 'Baker', 'Ben', 'Alpha')
		],
		generatedRows: [],
		finalRows: [
			{
				date: '2026-06-01',
				generatedAssigneeId: 'person-1',
				finalAssigneeId: 'person-1',
				assignmentSource: 'generated',
				generatedDisplay: previewPerson('person-1', 'SGT', 'Able', 'Ann', 'Alpha'),
				finalDisplay: previewPerson('person-1', 'SGT', 'Able', 'Ann', 'Alpha'),
				reason: null,
				warnings: []
			}
		],
		manualSelections: [],
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

function display(id: string, lastName: string, firstName: string) {
	return {
		id,
		rank: 'SGT',
		lastName,
		firstName,
		groupName: 'Alpha'
	};
}
