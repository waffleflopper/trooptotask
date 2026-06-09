import { describe, expect, it } from 'vitest';
import { buildDutyRosterCountSource, type DutyRosterCountSourceRun } from './dutyRosterCountSource';
import type { DutyRosterTemplateAcceptedSnapshot } from './dutyRosterTemplatePreview';
import type { DutyRosterPoolPersonnel, DutyRosterTemplate } from './dutyRosterTemplates';

const template: DutyRosterTemplate = {
	id: 'template-1',
	assignmentTypeId: 'assignment-type-1',
	name: 'CQ NCO',
	slug: 'cq-nco',
	shortCode: 'CQ',
	status: 'active',
	archivedAt: null,
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

const pool = [
	person({ id: 'alpha', lastName: 'Able', firstName: 'Ann' }),
	person({ id: 'bravo', lastName: 'Baker', firstName: 'Ben' }),
	person({ id: 'charlie', lastName: 'Charlie', firstName: 'Cal' })
];

describe('buildDutyRosterCountSource', () => {
	it('uses DA6 Roster Order when there is no Manual DA6 Baseline or accepted history', () => {
		const countSource = buildDutyRosterCountSource({
			template,
			resolvedPool: pool,
			runs: [],
			baselineStartDate: '2026-06-01'
		});

		expect(countSource).toMatchObject({
			source: 'da6-roster-order',
			sourceLabel: 'DA6 roster order',
			acceptedRunCount: 0,
			invalidatedRunCount: 0,
			continuationHistory: []
		});
		expect(countSource.rows.map((row) => [row.personnelId, row.count, row.lastDutyDate])).toEqual([
			['alpha', 0, null],
			['bravo', 0, null],
			['charlie', 0, null]
		]);
	});

	it('turns Manual DA6 Baseline into the first-run continuation history and count rows', () => {
		const countSource = buildDutyRosterCountSource({
			template: {
				...template,
				manualBaselineCounts: { alpha: 3, charlie: 1 }
			},
			resolvedPool: pool,
			runs: [],
			baselineStartDate: '2026-06-01'
		});

		expect(countSource).toMatchObject({
			source: 'manual-da6-baseline',
			sourceLabel: 'Manual DA6 Baseline',
			acceptedRunCount: 0,
			invalidatedRunCount: 0
		});
		expect(countSource.rows.map((row) => [row.personnelId, row.count])).toEqual([
			['alpha', 3],
			['bravo', 0],
			['charlie', 1]
		]);
		expect(countSource.continuationHistory).toEqual([
			expect.objectContaining({
				assignmentTypeId: 'assignment-type-1',
				startDate: '2026-05-29',
				endDate: '2026-05-31',
				config: expect.objectContaining({ historySource: 'manual-da6-baseline' }),
				roster: [
					expect.objectContaining({ date: '2026-05-31', assigneeId: 'alpha' }),
					expect.objectContaining({ date: '2026-05-29', assigneeId: 'charlie' })
				]
			})
		]);
	});

	it('uses accepted non-invalidated history with latest corrections as the official count source', () => {
		const countSource = buildDutyRosterCountSource({
			template: {
				...template,
				manualBaselineCounts: { alpha: 9 }
			},
			resolvedPool: pool,
			runs: [
				run({
					id: 'run-2',
					status: 'invalidated',
					acceptedAt: '2026-06-02T00:00:00.000Z',
					assigneeId: 'alpha',
					date: '2026-06-02',
					corrections: [{ runRowDate: '2026-06-02', replacementAssigneeId: 'charlie', reason: 'Did not count.' }]
				}),
				run({
					id: 'run-1',
					status: 'accepted',
					acceptedAt: '2026-06-01T00:00:00.000Z',
					assigneeId: 'bravo',
					date: '2026-06-01',
					corrections: [
						{ runRowDate: '2026-06-01', replacementAssigneeId: 'alpha', reason: 'Earlier correction.' },
						{ runRowDate: '2026-06-01', replacementAssigneeId: 'charlie', reason: 'Latest correction.' }
					]
				})
			],
			baselineStartDate: '2026-06-03'
		});

		expect(countSource).toMatchObject({
			source: 'accepted-history',
			sourceLabel: 'Accepted history',
			acceptedRunCount: 1,
			invalidatedRunCount: 1,
			countingCorrectionCount: 2,
			nonCountingCorrectionCount: 1
		});
		expect(countSource.sourceDescription).toContain('Latest counting corrections');
		expect(countSource.sourceDescription).toContain('Invalidated runs stay visible');
		expect(countSource.rows.map((row) => [row.personnelId, row.count, row.lastDutyDate])).toEqual([
			['alpha', 0, null],
			['bravo', 0, null],
			['charlie', 1, '2026-06-01']
		]);
		expect(countSource.rows.map((row) => [row.personnelId, row.appearedInAcceptedRun])).toEqual([
			['alpha', false],
			['bravo', true],
			['charlie', true]
		]);
		expect(countSource.continuationHistory[0].roster).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assigneeId: 'charlie',
				reason: 'Latest correction.'
			})
		]);
	});

	it('counts a corrected outside-pool final assignee in DA6 continuation history', () => {
		const countSource = buildDutyRosterCountSource({
			template,
			resolvedPool: pool,
			runs: [
				run({
					id: 'run-1',
					status: 'accepted',
					acceptedAt: '2026-06-01T00:00:00.000Z',
					assigneeId: 'alpha',
					date: '2026-06-01',
					corrections: [{ runRowDate: '2026-06-01', replacementAssigneeId: 'charlie', reason: 'Actually served.' }]
				})
			],
			baselineStartDate: '2026-06-02'
		});

		expect(countSource.continuationHistory[0]?.roster).toEqual([
			expect.objectContaining({ assigneeId: 'charlie', reason: 'Actually served.' })
		]);
		expect(countSource.continuationHistory[0]?.config.da6ContinuationCounts).toMatchObject({
			charlie: { single: 1 }
		});
	});

	it('uses Manual DA6 Baseline again when all accepted runs are invalidated', () => {
		const countSource = buildDutyRosterCountSource({
			template: {
				...template,
				manualBaselineCounts: { alpha: 2 }
			},
			resolvedPool: pool,
			runs: [
				run({
					id: 'run-1',
					status: 'invalidated',
					acceptedAt: '2026-06-01T00:00:00.000Z',
					assigneeId: 'bravo',
					date: '2026-06-01'
				})
			],
			baselineStartDate: '2026-06-02'
		});

		expect(countSource).toMatchObject({
			source: 'manual-da6-baseline',
			sourceLabel: 'Manual DA6 Baseline',
			acceptedRunCount: 0,
			invalidatedRunCount: 1
		});
		expect(countSource.rows.map((row) => [row.personnelId, row.count, row.appearedInAcceptedRun])).toEqual([
			['alpha', 2, false],
			['bravo', 0, false],
			['charlie', 0, false]
		]);
		expect(countSource.continuationHistory).toEqual([
			expect.objectContaining({
				config: expect.objectContaining({ historySource: 'manual-da6-baseline' })
			})
		]);
	});

	it('uses only accepted runs before the preview start and reports affected later runs', () => {
		const countSource = buildDutyRosterCountSource({
			template,
			resolvedPool: pool,
			runs: [
				run({
					id: 'june-run',
					status: 'accepted',
					acceptedAt: '2026-06-30T12:00:00.000Z',
					assigneeId: 'alpha',
					date: '2026-06-30'
				}),
				run({
					id: 'later-july-run',
					status: 'accepted',
					acceptedAt: '2026-07-15T12:00:00.000Z',
					assigneeId: 'bravo',
					date: '2026-07-15'
				})
			],
			baselineStartDate: '2026-07-01',
			previewStartDate: '2026-07-01',
			previewEndDate: '2026-07-14'
		});

		expect(countSource).toMatchObject({
			source: 'accepted-history',
			acceptedRunCount: 1,
			futureRunConflict: {
				code: 'future-accepted-runs',
				affectedRunCount: 1,
				firstAffectedRunId: 'later-july-run',
				firstAffectedRunStartDate: '2026-07-15',
				firstAffectedRunEndDate: '2026-07-15',
				latestAffectedRunEndDate: '2026-07-15'
			}
		});
		expect(countSource.rows.map((row) => [row.personnelId, row.count, row.lastDutyDate])).toEqual([
			['alpha', 1, '2026-06-30'],
			['bravo', 0, null],
			['charlie', 0, null]
		]);
	});
});

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

function run(input: {
	id: string;
	status: 'accepted' | 'invalidated';
	acceptedAt: string;
	assigneeId: string;
	date: string;
	corrections?: DutyRosterCountSourceRun['corrections'];
}): DutyRosterCountSourceRun {
	return {
		id: input.id,
		status: input.status,
		acceptedAt: input.acceptedAt,
		snapshot: snapshot({ date: input.date, assigneeId: input.assigneeId, acceptedAt: input.acceptedAt }),
		corrections: input.corrections ?? []
	};
}

function snapshot(input: { date: string; assigneeId: string; acceptedAt: string }): DutyRosterTemplateAcceptedSnapshot {
	const display = pool.find((personnel) => personnel.id === input.assigneeId) ?? null;
	const previewDisplay = display ? { ...display, archivedAt: display.archivedAt ?? null } : null;
	const da6 = {
		numberingMode: 'single-sequence' as const,
		columns: [
			{
				date: input.date,
				sequenceKind: 'weekday' as const,
				sequenceKey: 'single' as const,
				specialDayIds: [],
				chargeSequenceStart: 1,
				chargeableCount: 1
			}
		],
		rows: [
			{
				personnelId: input.assigneeId,
				display: previewDisplay ?? {
					id: input.assigneeId,
					rank: '',
					lastName: '',
					firstName: '',
					groupId: null,
					groupName: ''
				},
				cells: [
					{
						date: input.date,
						personnelId: input.assigneeId,
						code: 'assigned' as const,
						da6Code: null,
						chargeable: true,
						queuePosition: 1,
						sequenceNumber: 1,
						assigned: true,
						reason: null,
						reasonCode: null
					}
				]
			}
		]
	};
	return {
		snapshotVersion: 1,
		template: {
			id: 'assignment-type-1',
			name: 'CQ NCO',
			shortCode: 'CQ'
		},
		generatedAt: input.acceptedAt,
		acceptedAt: input.acceptedAt,
		acceptedByUserId: 'user-1',
		config: {
			startDate: input.date,
			endDate: input.date,
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
		resolvedPool: [],
		selectionPersonnel: pool.map((personnel) => ({ ...personnel, archivedAt: personnel.archivedAt ?? null })),
		generatedRows: [{ date: input.date, assigneeId: input.assigneeId }],
		finalRows: [
			{
				date: input.date,
				generatedAssigneeId: input.assigneeId,
				finalAssigneeId: input.assigneeId,
				assignmentSource: 'generated',
				generatedDisplay: previewDisplay,
				finalDisplay: previewDisplay,
				reason: null,
				warnings: []
			}
		],
		manualSelections: [],
		da6,
		exportModel: {
			assignmentType: { id: 'assignment-type-1', name: 'CQ NCO', shortName: 'CQ', color: '#8a5a22' },
			startDate: input.date,
			endDate: input.date,
			numberingMode: 'single-sequence',
			rosterRows: [{ date: input.date, assigneeId: input.assigneeId }],
			da6,
			sequencePeriods: []
		},
		warnings: []
	};
}
