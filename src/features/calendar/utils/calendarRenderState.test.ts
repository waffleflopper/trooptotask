import { describe, expect, it } from 'vitest';
import type { UpcomingLossRecord } from '$lib/domain/readinessSignals';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import { buildCalendarRenderState, CalendarRenderStateInputError } from './calendarRenderState';

const personnel: Personnel[] = [
	{
		id: 'person-1',
		firstName: 'Alex',
		lastName: 'Smith',
		rank: 'SGT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	}
];

const statusTypes: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#2563eb', textColor: '#ffffff' },
	{ id: 'school', name: 'School', color: '#16a34a', textColor: '#ffffff' }
];

const assignmentTypes: AssignmentType[] = [
	{
		id: 'mod',
		name: 'Manager on Duty',
		shortName: 'MOD',
		assignTo: 'personnel',
		color: '#dc2626',
		exemptPersonnelIds: [],
		showInDateHeader: true
	}
];

function availability(overrides: Partial<AvailabilityEntry>): AvailabilityEntry {
	return {
		id: 'availability-1',
		personnelId: 'person-1',
		statusTypeId: 'leave',
		startDate: '2026-03-01',
		endDate: '2026-03-01',
		note: null,
		...overrides
	};
}

function assignment(overrides: Partial<DailyAssignment>): DailyAssignment {
	return {
		id: 'assignment-1',
		date: '2026-03-01',
		assignmentTypeId: 'mod',
		assigneeId: 'person-1',
		...overrides
	};
}

function specialDay(overrides: Partial<SpecialDay>): SpecialDay {
	return {
		id: 'special-1',
		date: '2026-03-01',
		name: 'Training Holiday',
		type: 'org-closure',
		...overrides
	};
}

function lossRecord(): UpcomingLossRecord {
	return {
		id: 'person-1',
		personId: 'person-1',
		personName: 'SGT Smith',
		rank: 'SGT',
		lastName: 'Smith',
		triggerType: 'ETS',
		targetDate: '2026-07-01',
		daysRemaining: 78,
		awardDueSoon: true,
		awardTrackingAcknowledged: false,
		groupId: 'group-1'
	};
}

function build(overrides: Partial<Parameters<typeof buildCalendarRenderState>[0]> = {}) {
	return buildCalendarRenderState({
		dates: [new Date(2026, 2, 1), new Date(2026, 2, 2)],
		personnelByGroup: [{ group: 'Alpha', personnel }],
		availabilityEntries: [],
		statusTypes,
		specialDays: [],
		assignmentTypes,
		assignments: [],
		...overrides
	});
}

describe('calendarRenderState', () => {
	it('renders saved manual, linked and edited assignment markers at their saved person and date', () => {
		const saved = [
			assignment({ id: 'manual' }),
			assignment({
				id: 'linked',
				date: '2026-03-02'
			}),
			assignment({
				id: 'edited-generated',
				date: '2026-03-03',
				assigneeId: 'person-2'
			})
		];
		const input = {
			dates: [new Date(2026, 2, 1), new Date(2026, 2, 2), new Date(2026, 2, 3)],
			personnelByGroup: [{ group: 'Alpha', personnel: [...personnel, { ...personnel[0], id: 'person-2' }] }],
			assignments: saved
		};
		const state = build(input);

		expect(state.personDateCell('person-1', '2026-03-03')?.markers).toEqual([]);
		expect(state.personDateCell('person-1', '2026-03-01')?.markers).toEqual([
			expect.objectContaining({ id: 'manual', name: 'Manager on Duty' })
		]);
		expect(state.personDateCell('person-1', '2026-03-02')?.markers).toEqual([
			expect.objectContaining({ id: 'linked', name: 'Manager on Duty' })
		]);
		expect(state.personDateCell('person-2', '2026-03-03')?.markers).toEqual([
			expect.objectContaining({ id: 'edited-generated', name: 'Manager on Duty' })
		]);
	});

	it('keeps a saved Group assignment in the date header without turning it into a person assignment', () => {
		const state = build({
			groups: [{ id: 'group-1', name: 'Alpha Renamed', sortOrder: 0 }],
			assignmentTypes: [{ ...assignmentTypes[0], id: 'group-detail', name: 'Group Detail', assignTo: 'group' }],
			assignments: [assignment({ id: 'manual-group', assignmentTypeId: 'group-detail', assigneeId: 'group-1' })]
		});
		expect(state.headerCell('2026-03-01')?.headerAssignment).toEqual({
			assignmentTypeName: 'Group Detail',
			assigneeLabel: 'Alpha Renamed'
		});
		expect(state.personDateCell('person-1', '2026-03-01')?.markers).toEqual([]);
	});

	it('builds date header facts with special days and readable header assignment labels', () => {
		const state = build({
			specialDays: [specialDay({})],
			assignments: [assignment({})]
		});

		expect(state.dateKeys).toEqual(['2026-03-01', '2026-03-02']);
		expect(state.headerCells[0]).toMatchObject({
			dateKey: '2026-03-01',
			dayName: 'Sun',
			dayOfMonth: 1,
			weekend: true,
			holiday: true,
			holidayName: 'Training Holiday',
			title: 'Training Holiday',
			headerAssignment: {
				assignmentTypeName: 'Manager on Duty',
				assigneeLabel: 'SGT Smith'
			}
		});
	});

	it('builds one shared person-date cell shape for month and compact consumers', () => {
		const state = build({
			availabilityEntries: [
				availability({ id: 'availability-1', statusTypeId: 'leave' }),
				availability({ id: 'availability-2', statusTypeId: 'school' })
			],
			assignments: [assignment({})],
			activeOnboardingPersonnelIds: ['person-1'],
			upcomingLossMap: new Map([['person-1', lossRecord()]])
		});

		const header = state.personHeader('person-1');
		const cell = state.personDateCell('person-1', '2026-03-01');

		expect(header).toMatchObject({
			personnelId: 'person-1',
			isOnboarding: true,
			highlightOnboarding: true,
			upcomingLossRecord: { triggerType: 'ETS' }
		});
		expect(cell?.statuses.map((status) => status.name)).toEqual(['Leave', 'School']);
		expect(cell?.primaryStatus?.name).toBe('School');
		expect(cell?.markers).toEqual([
			expect.objectContaining({ id: 'assignment-1', name: 'Manager on Duty', textColor: '#ffffff' })
		]);
		expect(cell?.title).toBe('School');
		expect(state.personDateCells('person-1')).toHaveLength(2);
	});

	it('returns undefined for unknown person or date lookups', () => {
		const state = build();

		expect(state.personHeader('missing-person')).toBeUndefined();
		expect(state.personDateCells('missing-person')).toBeUndefined();
		expect(state.personDateCell('missing-person', '2026-03-01')).toBeUndefined();
		expect(state.personDateCell('person-1', '2026-03-09')).toBeUndefined();
	});

	it('returns indexed person-date cells from the cached row', () => {
		const state = build();

		const firstCell = state.personDateCell('person-1', '2026-03-01');
		const cachedRow = state.personDateCells('person-1');
		const secondCell = state.personDateCell('person-1', '2026-03-02');

		expect(firstCell).toBe(cachedRow?.[0]);
		expect(secondCell).toBe(cachedRow?.[1]);
		expect(state.personDateCells('person-1')).toBe(cachedRow);
	});

	it('records diagnostics for missing linked records and duplicate special days', () => {
		const state = build({
			availabilityEntries: [availability({ statusTypeId: 'missing-status' })],
			assignments: [
				assignment({ id: 'assignment-missing-type', assignmentTypeId: 'missing-type' }),
				assignment({ id: 'assignment-missing-person', assigneeId: 'missing-person' })
			],
			specialDays: [specialDay({ id: 'special-1' }), specialDay({ id: 'special-2', name: 'Duplicate' })]
		});

		expect(state.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'duplicate-special-day',
			'missing-status-type',
			'missing-assignment-type',
			'missing-header-assignee'
		]);
	});

	it('throws on duplicate visible date keys', () => {
		expect(() =>
			build({
				dates: [new Date(2026, 2, 1), new Date(2026, 2, 1)]
			})
		).toThrow(CalendarRenderStateInputError);
	});
});
