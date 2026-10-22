import type { AvailabilityEntry } from '$features/calendar/contracts';
import { BUILT_IN_RANK_CATALOG } from '$features/personnel/contracts';
import type {
	AssignmentSource,
	Da6Segment,
	DateKey,
	PersonState,
	RosterAssignment,
	RosterFacts,
	RosterPerson,
	StartingNumber
} from './rosterTypes';

export const STAFF_DUTY = 'staff-duty';
export const CQ = 'cq';

export function person(
	rank: string,
	lastName: string,
	options: { joined?: DateKey; states?: readonly Partial<PersonState>[] } = {}
): RosterPerson {
	const base: PersonState = {
		from: options.joined ?? '2026-01-01',
		active: true,
		rank,
		mos: '',
		clinicRole: '',
		groupId: null
	};
	const [first = {}, ...rest] = options.states ?? [{}];
	let previous: PersonState = { ...base, ...first };
	const states: [PersonState, ...PersonState[]] = [previous];
	for (const change of rest) {
		previous = { ...previous, ...change };
		states.push(previous);
	}
	return { id: lastName.toLowerCase(), rank, lastName, firstName: '', states };
}

export function status(
	personnelId: string,
	statusTypeId: string,
	startDate: DateKey,
	endDate: DateKey
): AvailabilityEntry {
	return { id: `${personnelId}-${statusTypeId}-${startDate}`, personnelId, statusTypeId, startDate, endDate };
}

export function assigned(
	date: DateKey,
	assigneeId: string,
	source: AssignmentSource = 'manual',
	assignmentTypeId = STAFF_DUTY
): RosterAssignment {
	return { date, assigneeId, source, assignmentTypeId };
}

export function typed(personId: string, count: number, track: StartingNumber['track'] = 'all'): StartingNumber {
	return { personId, track, count, origin: 'typed' };
}

export function rosterFacts(
	input: Partial<Omit<RosterFacts, 'form'>> & { form?: Partial<RosterFacts['form']> } = {}
): RosterFacts {
	const { form, ...rest } = input;
	return {
		today: '2026-10-16',
		window: { from: '2026-10-01', through: '2026-10-31' },
		type: { id: STAFF_DUTY, name: 'Staff Duty' },
		people: [],
		excusals: [],
		rankCatalog: BUILT_IN_RANK_CATALOG,
		statusTypes: [
			{ id: 'tdy', name: 'TDY', rosterEffect: 'A' },
			{ id: 'leave', name: 'Leave', rosterEffect: 'A' },
			{ id: 'detail', name: 'Detail', rosterEffect: 'D' },
			{ id: 'arrest', name: 'Arrest', rosterEffect: 'U' }
		],
		availability: [],
		holidays: [],
		assignments: [],
		assignmentTypeNames: new Map([[CQ, 'CQ']]),
		...rest,
		form: {
			kind: 'open',
			id: 'form-1',
			startsOn: '2026-10-01',
			rules: { pool: null, weekendMode: 'same' },
			startingNumbers: [],
			...form
		}
	};
}

/** Paper frame R4: Staff Duty, 1 to 24 Oct 2026, one track, today 16 Oct. */
export const R4_STARTING: readonly [rank: string, lastName: string, count: number][] = [
	['SSG', 'Alvarez', 9],
	['SSG', 'Hale', 4],
	['SGT', 'Kim', 8],
	['SGT', 'Morales', 3],
	['SGT', 'Okafor', 6],
	['SPC', 'Liang', 2],
	['SPC', 'Moss', 10],
	['SPC', 'Nguyen', 5],
	['SPC', 'Ortiz', 1],
	['SPC', 'Patel', 11],
	['PFC', 'Brooks', 7],
	['PFC', 'Fuller', 0],
	['PFC', 'Grant', 12]
];

export const R4_PICKS = [
	'grant',
	'patel',
	'moss',
	'alvarez',
	'kim',
	'brooks',
	'okafor',
	'nguyen',
	'hale',
	'morales',
	'liang',
	'fuller',
	'grant',
	'patel',
	'moss',
	'alvarez',
	'ortiz',
	'kim',
	'brooks',
	'nguyen',
	'hale',
	'morales',
	'liang',
	'okafor'
];

export function octoberDate(day: number): DateKey {
	return `2026-10-${String(day).padStart(2, '0')}`;
}

/** R4 with no assignments: the facts a fill starts from. */
export function r4Facts(): RosterFacts {
	return rosterFacts({
		window: { from: '2026-10-01', through: '2026-10-24' },
		people: [...R4_STARTING.map(([rank, lastName]) => person(rank, lastName)), person('1SG', 'Moreno')],
		excusals: [{ personId: 'moreno', reason: 'First sergeant', from: '2026-10-01', through: null }],
		availability: [
			status('ortiz', 'tdy', '2026-10-12', '2026-10-16'),
			status('okafor', 'leave', '2026-10-20', '2026-10-23'),
			status('patel', 'detail', '2026-10-07', '2026-10-08')
		],
		form: { startingNumbers: R4_STARTING.map(([, lastName, count]) => typed(lastName.toLowerCase(), count)) }
	});
}

/** R4 with its 24 assignments stored: manual through today, roster picks after. */
export function storedR4(): RosterFacts {
	return {
		...r4Facts(),
		assignments: R4_PICKS.map((personId, index) =>
			assigned(octoberDate(index + 1), personId, index + 1 <= 16 ? 'manual' : 'roster')
		)
	};
}

/** One line per row as the paper form reads: `*13` pulled duty, `A` away, `D5` other duty, `.` not on the roster. */
export function gridLines(segment: Da6Segment): string[] {
	return segment.rows.map((row, index) =>
		[
			`${row.rank} ${row.lastName}`,
			...segment.cells[index].map((cell) => {
				if (cell === null) return '.';
				if (cell.kind === 'detail') return `*${cell.count}`;
				if (cell.kind === 'away') return 'A';
				if (cell.kind === 'code') return `${cell.code}${cell.count}`;
				return String(cell.count);
			})
		].join(' ')
	);
}
