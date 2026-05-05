import { describe, expect, it } from 'vitest';
import {
	buildDutyRosterApplyPayload,
	buildDutyRosterExportModel,
	buildDutyRosterHistoryPayload,
	buildDutyRosterRunSnapshot
} from './dutyRosterRun';
import type { DutyRosterRunInput } from './dutyRosterRun.types';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
import type { AssignmentType, DailyAssignment, Personnel } from '$lib/types';

const assignmentType: AssignmentType = {
	id: 'staff-duty',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#111827',
	exemptPersonnelIds: [],
	showInDateHeader: true
};

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: overrides.id ?? 'person',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Soldier',
		firstName: overrides.firstName ?? 'Sam',
		mos: '11B',
		clinicRole: 'Duty Role',
		groupId: 'group-a',
		groupName: 'Alpha',
		...overrides
	};
}

function baseInput(overrides: Partial<DutyRosterRunInput> = {}): DutyRosterRunInput {
	return {
		assignmentType,
		personnel: [
			person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha', firstName: 'Avery' }),
			person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo', firstName: 'Blake' })
		],
		assignments: [],
		advancedDutyEvents: [],
		availabilityEntries: [],
		statusTypes: [
			{
				id: 'leave',
				name: 'Leave',
				color: '#008000',
				textColor: '#fff',
				da6AvailabilityTreatment: 'authorized-absence',
				da6TreatmentReviewed: true
			}
		],
		specialDays: [],
		config: {
			startDate: '2026-05-01',
			endDate: '2026-05-01',
			dutyDuration: 'daily',
			excludedStatusIds: ['leave'],
			excludeWeekends: false,
			excludeHolidays: false,
			excludeOrgClosures: false
		},
		generatedAt: '2026-04-28T00:00:00.000Z',
		...overrides
	};
}

function daily(overrides: Partial<DailyAssignment>): DailyAssignment {
	return {
		id: overrides.id ?? 'assignment',
		date: overrides.date ?? '2026-04-01',
		assignmentTypeId: overrides.assignmentTypeId ?? 'staff-duty',
		assigneeId: overrides.assigneeId ?? 'alpha'
	};
}

function advancedDuty(overrides: Partial<DutyEvent>): DutyEvent {
	return {
		id: overrides.id ?? 'advanced-duty',
		orgId: 'org',
		runId: null,
		templateId: 'template',
		templateName: 'CQ',
		eventDate: '2026-05-01',
		coverageMode: 'all-day',
		coverageStart: overrides.coverageStart ?? '2026-05-01T00:00:00',
		coverageEnd: overrides.coverageEnd ?? '2026-05-01T23:59:59',
		isBlocking: overrides.isBlocking ?? true,
		cooldownHours: overrides.cooldownHours ?? 0,
		rulesSnapshot: {
			templateId: 'template',
			templateName: 'CQ',
			templateStatus: 'active',
			coverageMode: 'all-day',
			startTime: null,
			endTime: null,
			scopeType: 'organization',
			scopeGroupIds: [],
			isBlocking: true,
			cooldownHours: 0,
			slots: [
				{
					templateSlotId: 'slot',
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: [],
					allowedGroupIds: [],
					preferredGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: [],
					rotationPoolKey: 'runner',
					blockingMode: 'inherit',
					sortOrder: 0
				}
			]
		},
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		createdAt: '2026-04-28T00:00:00.000Z',
		updatedAt: '2026-04-28T00:00:00.000Z',
		slotInstances: [
			{
				id: 'slot-instance',
				dutyEventId: 'advanced-duty',
				templateSlotId: 'slot',
				roleLabel: 'Runner',
				slotIndex: 0,
				assigneeId: 'alpha',
				assignmentSource: 'generated',
				warningState: 'none',
				fairnessConfidence: 'high',
				selectionReason: null,
				unfilledReason: null,
				sortOrder: 0
			}
		],
		...overrides
	};
}

describe('buildDutyRosterRunSnapshot', () => {
	it('selects the Soldier with the longest break and uses DA6 roster order as the tie-breaker', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [
					person({ id: 'junior', rank: 'SPC', lastName: 'Alpha' }),
					person({ id: 'senior-b', rank: 'SSG', lastName: 'Bravo' }),
					person({ id: 'senior-a', rank: 'SSG', lastName: 'Able' })
				],
				assignments: [
					daily({ id: 'junior-old', assigneeId: 'junior', date: '2026-01-01' }),
					daily({ id: 'senior-a-new', assigneeId: 'senior-a', date: '2026-04-20' }),
					daily({ id: 'senior-b-old', assigneeId: 'senior-b', date: '2026-02-01' })
				]
			})
		);

		expect(snapshot.rosterRows[0]).toMatchObject({ date: '2026-05-01', assigneeId: 'junior' });
		expect(snapshot.da6.rows.map((row) => row.personnelId)).toEqual(['senior-a', 'senior-b', 'junior']);
	});

	it('uses manual history imports as continuation history without assignment type counter state', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				rosterHistory: [
					{
						assignmentTypeId: 'staff-duty',
						startDate: '2026-04-30',
						endDate: '2026-04-30',
						roster: [
							{
								date: '2026-04-30',
								assigneeId: 'alpha',
								assigneeName: 'Alpha, Avery',
								assigneeRank: 'SGT',
								assigneeGroup: 'Alpha'
							}
						],
						config: {
							historySource: 'manual-history-import',
							sourceNote: 'Copied from signed DA6.'
						}
					}
				]
			})
		);

		expect(snapshot.rosterRows[0]).toMatchObject({ date: '2026-05-01', assigneeId: 'bravo' });
		expect(snapshot.assignmentType).not.toHaveProperty('counter');
		expect(snapshot.assignmentType).not.toHaveProperty('startingCounter');
	});

	it('records authorized absence as nonchargeable A cells that interrupt queue numbering', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [
					person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha' }),
					person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo' }),
					person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' })
				],
				availabilityEntries: [
					{
						id: 'leave-alpha',
						personnelId: 'alpha',
						statusTypeId: 'leave',
						startDate: '2026-05-01',
						endDate: '2026-05-01'
					}
				]
			})
		);

		const cells = snapshot.da6.rows.map((row) => row.cells[0]);
		expect(cells[0]).toMatchObject({
			personnelId: 'alpha',
			code: 'authorized-absence',
			da6Code: 'A',
			chargeable: false,
			queuePosition: null
		});
		expect(cells[1]).toMatchObject({
			personnelId: 'bravo',
			code: 'assigned',
			chargeable: true,
			queuePosition: 1,
			sequenceNumber: 1
		});
		expect(cells[2]).toMatchObject({
			personnelId: 'charlie',
			code: 'available-not-selected',
			chargeable: true,
			queuePosition: 2,
			sequenceNumber: 2
		});
	});

	it('resets the visible DA6 count after duty, pauses it for A, and advances it for D', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [
					person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha' }),
					person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo' }),
					person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' })
				],
				assignments: [
					daily({ id: 'alpha-recent', assigneeId: 'alpha', date: '2026-04-30' }),
					daily({ id: 'bravo-recent', assigneeId: 'bravo', date: '2026-04-29' }),
					daily({ id: 'charlie-old', assigneeId: 'charlie', date: '2026-04-01' })
				],
				rosterHistory: [
					{
						assignmentTypeId: 'staff-duty',
						startDate: '2026-04-11',
						endDate: '2026-04-30',
						roster: [],
						config: {
							historySource: 'manual-da6-baseline',
							manualBaselineCounts: { alpha: 20, bravo: 20, charlie: 20 }
						}
					}
				],
				statusTypes: [
					{
						id: 'leave',
						name: 'Leave',
						color: '#008000',
						textColor: '#fff',
						da6AvailabilityTreatment: 'authorized-absence',
						da6TreatmentReviewed: true
					},
					{
						id: 'detail',
						name: 'Detail',
						color: '#111827',
						textColor: '#fff',
						da6AvailabilityTreatment: 'other-duty',
						da6TreatmentReviewed: true
					}
				],
				availabilityEntries: [
					{
						id: 'leave-alpha',
						personnelId: 'alpha',
						statusTypeId: 'leave',
						startDate: '2026-05-02',
						endDate: '2026-05-06'
					},
					{
						id: 'detail-bravo',
						personnelId: 'bravo',
						statusTypeId: 'detail',
						startDate: '2026-05-02',
						endDate: '2026-05-06'
					}
				],
				config: {
					startDate: '2026-05-01',
					endDate: '2026-05-07',
					dutyDuration: 'daily',
					excludedStatusIds: ['leave', 'detail'],
					excludeWeekends: false,
					excludeHolidays: false,
					excludeOrgClosures: false
				}
			})
		);

		const alpha = snapshot.da6.rows.find((row) => row.personnelId === 'alpha')!;
		const bravo = snapshot.da6.rows.find((row) => row.personnelId === 'bravo')!;
		const firstAssigned = snapshot.da6.rows.find((row) => row.cells[0].assigned)!;

		expect(alpha.cells.map((cell) => [cell.da6Code, cell.sequenceNumber])).toEqual([
			[null, 20],
			['A', 21],
			['A', 21],
			['A', 21],
			['A', 21],
			['A', 21],
			[null, 21]
		]);
		expect(bravo.cells.map((cell) => [cell.da6Code, cell.sequenceNumber])).toEqual([
			[null, 20],
			['D', 21],
			['D', 22],
			['D', 23],
			['D', 24],
			['D', 25],
			[null, 26]
		]);
		expect(firstAssigned.cells[0].assigned).toBe(true);
		expect(firstAssigned.cells[1].sequenceNumber).toBe(1);
	});

	it('records advanced duty overlap and cooldown as chargeable D cells that keep numbering moving', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [
					person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha' }),
					person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo' }),
					person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' })
				],
				advancedDutyEvents: [
					advancedDuty({ id: 'overlap', slotInstances: [advancedDuty({}).slotInstances[0]] }),
					advancedDuty({
						id: 'cooldown',
						coverageStart: '2026-04-30T08:00:00',
						coverageEnd: '2026-04-30T20:00:00',
						cooldownHours: 12,
						slotInstances: [{ ...advancedDuty({}).slotInstances[0], id: 'slot-instance-2', assigneeId: 'bravo' }]
					})
				]
			})
		);

		const cells = snapshot.da6.rows.map((row) => row.cells[0]);
		expect(cells[0]).toMatchObject({
			code: 'blocked-by-duty',
			da6Code: 'D',
			chargeable: true,
			queuePosition: 1,
			sequenceNumber: 1
		});
		expect(cells[1]).toMatchObject({
			code: 'blocked-by-cooldown',
			da6Code: 'D',
			chargeable: true,
			queuePosition: 2,
			sequenceNumber: 2
		});
		expect(cells[2]).toMatchObject({
			code: 'assigned',
			queuePosition: 3,
			sequenceNumber: 3
		});
	});

	it('uses DA6 status treatments instead of treating every selected status as authorized absence', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [
					person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha' }),
					person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo' }),
					person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' })
				],
				statusTypes: [
					{
						id: 'appointment',
						name: 'Appointment',
						color: '#ed8936',
						textColor: '#fff',
						da6AvailabilityTreatment: null,
						da6TreatmentReviewed: true
					},
					{
						id: 'detail',
						name: 'Other Duty / Detail',
						color: '#a0522d',
						textColor: '#fff',
						da6AvailabilityTreatment: 'other-duty',
						da6TreatmentReviewed: true
					}
				],
				availabilityEntries: [
					{
						id: 'appointment-alpha',
						personnelId: 'alpha',
						statusTypeId: 'appointment',
						startDate: '2026-05-01',
						endDate: '2026-05-01'
					},
					{
						id: 'detail-bravo',
						personnelId: 'bravo',
						statusTypeId: 'detail',
						startDate: '2026-05-01',
						endDate: '2026-05-01'
					}
				],
				config: {
					startDate: '2026-05-01',
					endDate: '2026-05-01',
					dutyDuration: 'daily',
					excludedStatusIds: ['appointment', 'detail'],
					excludeWeekends: false,
					excludeHolidays: false,
					excludeOrgClosures: false
				}
			})
		);

		const cells = snapshot.da6.rows.map((row) => row.cells[0]);
		expect(cells[0]).toMatchObject({
			personnelId: 'alpha',
			code: 'assigned',
			chargeable: true,
			queuePosition: 1
		});
		expect(cells[1]).toMatchObject({
			personnelId: 'bravo',
			code: 'blocked-by-duty',
			da6Code: 'D',
			chargeable: true,
			queuePosition: 2,
			sequenceNumber: 2
		});
	});

	it('lets authorized absence win over other-duty status when statuses overlap', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [
					person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha' }),
					person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo' })
				],
				statusTypes: [
					{
						id: 'leave',
						name: 'Leave',
						color: '#008000',
						textColor: '#fff',
						da6AvailabilityTreatment: 'authorized-absence',
						da6TreatmentReviewed: true
					},
					{
						id: 'detail',
						name: 'Other Duty / Detail',
						color: '#a0522d',
						textColor: '#fff',
						da6AvailabilityTreatment: 'other-duty',
						da6TreatmentReviewed: true
					}
				],
				availabilityEntries: [
					{
						id: 'leave-alpha',
						personnelId: 'alpha',
						statusTypeId: 'leave',
						startDate: '2026-05-01',
						endDate: '2026-05-01'
					},
					{
						id: 'detail-alpha',
						personnelId: 'alpha',
						statusTypeId: 'detail',
						startDate: '2026-05-01',
						endDate: '2026-05-01'
					}
				]
			})
		);

		expect(snapshot.da6.rows.find((row) => row.personnelId === 'alpha')?.cells[0]).toMatchObject({
			code: 'authorized-absence',
			da6Code: 'A',
			chargeable: false,
			queuePosition: null
		});
		expect(snapshot.rosterRows[0].assigneeId).toBe('bravo');
	});

	it('classifies dates and records unfilled explanations when no Soldier can be selected', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha' })],
				config: {
					startDate: '2026-07-03',
					endDate: '2026-07-05',
					dutyDuration: 'daily',
					excludedStatusIds: ['leave'],
					excludeWeekends: false,
					excludeHolidays: false,
					excludeOrgClosures: false,
					exemptPersonnelIds: ['alpha']
				},
				specialDays: [
					{ id: 'holiday', date: '2026-07-03', name: 'Independence Day', type: 'federal-holiday' },
					{ id: 'closure', date: '2026-07-05', name: 'Training Stand-down', type: 'org-closure' }
				]
			})
		);

		expect(snapshot.da6.columns.map((column) => [column.date, column.sequenceKind])).toEqual([
			['2026-07-03', 'holiday'],
			['2026-07-04', 'weekend'],
			['2026-07-05', 'weekend-holiday']
		]);
		expect(snapshot.da6.rows).toEqual([]);
		expect(snapshot.rosterRows).toEqual([
			{ date: '2026-07-03', assigneeId: null, reason: 'No eligible personnel available' },
			{ date: '2026-07-04', assigneeId: null, reason: 'No eligible personnel available' },
			{ date: '2026-07-05', assigneeId: null, reason: 'No eligible personnel available' }
		]);
	});

	it('advances monthly duty dates without drifting from month-end starts', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				config: {
					startDate: '2026-01-31',
					endDate: '2026-04-30',
					dutyDuration: 'monthly',
					excludedStatusIds: [],
					excludeWeekends: false,
					excludeHolidays: false,
					excludeOrgClosures: false
				}
			})
		);

		expect(snapshot.rosterRows.map((row) => row.date)).toEqual([
			'2026-01-31',
			'2026-02-28',
			'2026-03-31',
			'2026-04-30'
		]);
	});

	it('keeps weekend and holiday charge counters separate from weekday counters when configured', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [
					person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha' }),
					person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo' })
				],
				config: {
					startDate: '2026-05-01',
					endDate: '2026-05-04',
					dutyDuration: 'daily',
					excludedStatusIds: [],
					excludeWeekends: false,
					excludeHolidays: false,
					excludeOrgClosures: false,
					numberingMode: 'separate-weekend-holiday'
				},
				specialDays: [{ id: 'holiday', date: '2026-05-04', name: 'Training Holiday', type: 'federal-holiday' }]
			})
		);

		expect(snapshot.da6.numberingMode).toBe('separate-weekend-holiday');
		expect(
			snapshot.da6.columns.map(({ date, sequenceKind, sequenceKey, chargeSequenceStart, chargeableCount }) => ({
				date,
				sequenceKind,
				sequenceKey,
				chargeSequenceStart,
				chargeableCount
			}))
		).toEqual([
			{
				date: '2026-05-01',
				sequenceKind: 'weekday',
				sequenceKey: 'weekday',
				chargeSequenceStart: 1,
				chargeableCount: 2
			},
			{
				date: '2026-05-02',
				sequenceKind: 'weekend',
				sequenceKey: 'weekend-holiday',
				chargeSequenceStart: 1,
				chargeableCount: 2
			},
			{
				date: '2026-05-03',
				sequenceKind: 'weekend',
				sequenceKey: 'weekend-holiday',
				chargeSequenceStart: 2,
				chargeableCount: 2
			},
			{
				date: '2026-05-04',
				sequenceKind: 'holiday',
				sequenceKey: 'weekend-holiday',
				chargeSequenceStart: 3,
				chargeableCount: 2
			}
		]);
		expect(snapshot.da6.rows[0].cells.map((cell) => cell.sequenceNumber)).toEqual([1, 2, 3, 1]);
		expect(snapshot.da6.rows[1].cells.map((cell) => cell.sequenceNumber)).toEqual([2, 1, 1, 2]);
		expect(snapshot.exportModel.sequencePeriods).toEqual([
			{
				date: '2026-05-01',
				sequenceKind: 'weekday',
				sequenceKey: 'weekday',
				isWeekendOrHoliday: false,
				specialDayIds: []
			},
			{
				date: '2026-05-02',
				sequenceKind: 'weekend',
				sequenceKey: 'weekend-holiday',
				isWeekendOrHoliday: true,
				specialDayIds: []
			},
			{
				date: '2026-05-03',
				sequenceKind: 'weekend',
				sequenceKey: 'weekend-holiday',
				isWeekendOrHoliday: true,
				specialDayIds: []
			},
			{
				date: '2026-05-04',
				sequenceKind: 'holiday',
				sequenceKey: 'weekend-holiday',
				isWeekendOrHoliday: true,
				specialDayIds: ['holiday']
			}
		]);
	});

	it('captures display fields immutably and represents future misconduct U cells without selecting them', () => {
		const alpha = person({ id: 'alpha', rank: 'SGT', lastName: 'Able' });
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [alpha, person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo' })],
				config: {
					startDate: '2026-05-01',
					endDate: '2026-05-01',
					dutyDuration: 'daily',
					excludedStatusIds: [],
					excludeWeekends: false,
					excludeHolidays: false,
					excludeOrgClosures: false,
					misconductUnavailablePersonnelDates: { alpha: ['2026-05-01'] }
				}
			})
		);
		alpha.lastName = 'Changed';

		expect(snapshot.personnel.find((item) => item.id === 'alpha')).toMatchObject({ lastName: 'Able' });
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.da6.rows[0].cells[0])).toBe(true);
		expect(snapshot.rosterRows[0].assigneeId).toBe('bravo');
		expect(snapshot.da6.rows.find((row) => row.personnelId === 'alpha')?.cells[0]).toMatchObject({
			personnelId: 'alpha',
			code: 'misconduct-unavailable',
			da6Code: 'U',
			chargeable: true,
			queuePosition: 1
		});
	});

	it('derives apply payload from assigned rows in the active snapshot', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				config: {
					startDate: '2026-05-01',
					endDate: '2026-05-02',
					dutyDuration: 'daily',
					excludedStatusIds: [],
					excludeWeekends: false,
					excludeHolidays: false,
					excludeOrgClosures: false
				}
			})
		);

		expect(buildDutyRosterApplyPayload(snapshot)).toEqual([
			{ date: '2026-05-01', assignmentTypeId: 'staff-duty', assigneeId: 'alpha' },
			{ date: '2026-05-02', assignmentTypeId: 'staff-duty', assigneeId: 'bravo' }
		]);
	});

	it('derives history payload from snapshot display fields and generation config', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [person({ id: 'alpha', rank: 'SSG', lastName: 'Able', firstName: 'Avery', groupName: 'HQ' })],
				config: {
					startDate: '2026-05-01',
					endDate: '2026-05-01',
					dutyDuration: 'weekly',
					excludedStatusIds: ['leave'],
					excludeWeekends: true,
					excludeHolidays: true,
					excludeOrgClosures: false,
					exemptPersonnelIds: ['exempt-soldier']
				}
			})
		);

		expect(buildDutyRosterHistoryPayload(snapshot)).toMatchObject({
			assignmentTypeId: 'staff-duty',
			name: 'Staff Duty – May 1, 2026 to May 1, 2026',
			startDate: '2026-05-01',
			endDate: '2026-05-01',
			roster: [
				{
					date: '2026-05-01',
					assigneeId: 'alpha',
					assigneeName: 'Able, Avery',
					assigneeRank: 'SSG',
					assigneeGroup: 'HQ'
				}
			],
			config: {
				dutyDuration: 'weekly',
				assignmentTypeName: 'Staff Duty',
				exemptPersonnelIds: ['exempt-soldier'],
				excludeStatuses: ['leave'],
				excludeWeekends: true,
				excludeHolidays: true,
				excludeOrgClosures: false
			}
		});
	});

	it('preserves assigned markers separately from DA6 queue positions in history payloads', () => {
		const snapshot = buildDutyRosterRunSnapshot(
			baseInput({
				personnel: [
					person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha' }),
					person({ id: 'bravo', rank: 'SGT', lastName: 'Bravo' })
				],
				statusTypes: [
					{
						id: 'detail',
						name: 'Detail',
						color: '#111827',
						textColor: '#fff',
						da6AvailabilityTreatment: 'other-duty',
						da6TreatmentReviewed: true
					}
				],
				availabilityEntries: [
					{
						id: 'detail-alpha',
						personnelId: 'alpha',
						statusTypeId: 'detail',
						startDate: '2026-05-01',
						endDate: '2026-05-01'
					}
				],
				config: {
					startDate: '2026-05-01',
					endDate: '2026-05-01',
					dutyDuration: 'daily',
					excludedStatusIds: ['detail'],
					excludeWeekends: false,
					excludeHolidays: false,
					excludeOrgClosures: false
				}
			})
		);

		expect(buildDutyRosterHistoryPayload(snapshot).da6?.dates[0]).toEqual({
			date: '2026-05-01',
			positions: [1, 2],
			assigned: [false, true]
		});
	});

	it('derives export model from the active snapshot without rebuilding from live inputs', () => {
		const input = baseInput();
		const snapshot = buildDutyRosterRunSnapshot(input);

		input.assignmentType.name = 'Changed Duty';
		input.personnel[0].lastName = 'Changed';
		input.config.startDate = '2026-06-01';

		expect(buildDutyRosterExportModel(snapshot)).toEqual(snapshot.exportModel);
		expect(buildDutyRosterExportModel(snapshot)).toMatchObject({
			assignmentType: { name: 'Staff Duty' },
			startDate: '2026-05-01',
			rosterRows: [{ date: '2026-05-01', assigneeId: 'alpha' }]
		});
	});
});
