import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { tracksOf } from './rosterCalendar';
import { inDa6Order } from './rosterPool';
import { simulateRoster } from './rosterSimulation';
import type {
	CountChange,
	Da6Cell,
	Da6Column,
	Da6PassedOver,
	Da6Remark,
	Da6Segment,
	DateKey,
	MonthKey,
	PersonRef,
	ReplacementOptions,
	RosterDay,
	RosterFacts,
	RosterRun,
	RosterSlotChange,
	Standing,
	StartingNumber,
	TrackId,
	WeekendMode
} from './rosterTypes';

/** Per track, the first date on or after `date` inside the window. An open day shows what it would show if filled. */
export function standingOn(run: RosterRun, date: DateKey): RosterDay[] {
	return tracksOf(run.facts.form.rules.weekendMode).flatMap((track) => {
		const day = run.days.find((candidate) => candidate.track === track && candidate.date >= date);
		return day ? [day] : [];
	});
}

/** People ahead of the rule's pick in standing. Every one of them has a code. */
export function passedOver(day: RosterDay): Standing[] {
	const at = day.standing.findIndex((entry) => entry.personId === day.rulePick);
	return day.standing.slice(0, at < 0 ? day.standing.length : at);
}

function assigneeOf(day: RosterDay): string | null {
	return day.detail?.personId ?? null;
}

/** R3b from the base run: the rule's pick, available candidates with next-door duty hints, and who cannot pull. */
export function replacementOptions(run: RosterRun, date: DateKey): ReplacementOptions {
	const day = run.byDate.get(date);
	if (!day) throw new RangeError(`${date} is not a detail date inside the window.`);
	const { facts } = run;
	const around = new Set([fromDayNumber(toDayNumber(date) - 1), fromDayNumber(toDayNumber(date) + 1)]);
	const adjacent = new Map<string, string[]>();
	for (const assignment of facts.assignments) {
		if (!around.has(assignment.date)) continue;
		const name =
			assignment.assignmentTypeId === facts.type.id
				? facts.type.name
				: (facts.assignmentTypeNames.get(assignment.assignmentTypeId) ?? assignment.assignmentTypeId);
		const names = adjacent.get(assignment.assigneeId) ?? [];
		if (!names.includes(name)) names.push(name);
		adjacent.set(assignment.assigneeId, names);
	}
	return {
		day,
		nextUp: day.rulePick,
		candidates: day.standing
			.filter((entry) => entry.effect.code === 'available' && entry.personId !== assigneeOf(day))
			.map((entry) => ({ ...entry, adjacent: adjacent.get(entry.personId) ?? [] })),
		cantPull: passedOver(day)
	};
}

/** Days in the window whose assignee has A, D or U that day. */
export function detailConflicts(run: RosterRun): RosterDay[] {
	return run.days.filter((day) => {
		const assignee = assigneeOf(day);
		const effect = day.standing.find((entry) => entry.personId === assignee)?.effect;
		return effect !== undefined && effect.code !== 'available';
	});
}

/** Numbers that differ on `on` between two runs of the same form. Ordered by track, then DA 6 order. */
export function countChanges(before: RosterRun, after: RosterRun, on: DateKey): CountChange[] {
	const order = new Map(
		inDa6Order(before.facts.people, before.facts.rankCatalog).map((person, index) => [person.id, index])
	);
	const afterDays = new Map(standingOn(after, on).map((day) => [day.track, day]));
	return standingOn(before, on).flatMap((day) => {
		const counts = new Map(afterDays.get(day.track)?.standing.map((entry) => [entry.personId, entry.count]));
		return day.standing
			.filter((entry) => counts.has(entry.personId) && counts.get(entry.personId) !== entry.count)
			.sort((a, b) => order.get(a.personId)! - order.get(b.personId)!)
			.map((entry) => ({
				personId: entry.personId,
				track: day.track,
				from: entry.count,
				to: counts.get(entry.personId)!
			}));
	});
}

/** The batch for setAssignmentBatch. */
export function slotChanges(run: RosterRun): RosterSlotChange[] {
	return run.changes.map((change) => ({
		date: change.date,
		assignmentTypeId: run.facts.type.id,
		assigneeId: change.personId,
		source: 'roster'
	}));
}

/** The open form's part of `month`, or null when the month has no detail day. Columns are detail days only. */
export function da6Segment(run: RosterRun, month: MonthKey): Da6Segment | null {
	return segment(run, month, 'open');
}

function segment(run: RosterRun, month: MonthKey, formState: Da6Segment['formState']): Da6Segment | null {
	const { facts } = run;
	const ref = personRefs(facts);
	const days = run.days.filter((day) => day.detail !== null && day.date.startsWith(month));
	if (!days.length) return null;

	const order = new Map(inDa6Order(facts.people, facts.rankCatalog).map((person, index) => [person.id, index]));
	const firstColumn = new Map<string, number>();
	days.forEach((day, column) => {
		for (const entry of day.standing) if (!firstColumn.has(entry.personId)) firstColumn.set(entry.personId, column);
	});
	const rowIds = [...firstColumn.keys()].sort(
		(a, b) => firstColumn.get(a)! - firstColumn.get(b)! || order.get(a)! - order.get(b)!
	);

	const columns: Da6Column[] = days.map((day) => {
		const detail = day.detail!;
		return {
			date: day.date,
			track: day.track,
			when: whenOf(day),
			pick: ref(detail.personId),
			source: detail.kind === 'stored' ? detail.source : 'roster',
			passedOver: passedOver(day).flatMap(({ personId, count, effect }): Da6PassedOver[] =>
				effect.code === 'available' ? [] : [{ ...ref(personId), count, code: effect.code, reason: effect.reason }]
			),
			rulePick: day.rulePick !== null && day.rulePick !== detail.personId ? ref(day.rulePick) : null
		};
	});

	const cells = rowIds.map((personId) =>
		days.map((day): Da6Cell => {
			const entry = day.standing.find((candidate) => candidate.personId === personId);
			if (!entry) return null;
			if (assigneeOf(day) === personId) return { kind: 'detail', count: entry.count, when: whenOf(day) };
			const { effect } = entry;
			if (effect.code === 'available') return { kind: 'count', count: entry.count };
			if (effect.code === 'A') return { kind: 'away', count: entry.count, reason: effect.reason };
			return { kind: 'code', code: effect.code, count: entry.count, reason: effect.reason };
		})
	);

	return {
		formId: facts.form.id,
		formState,
		natureOfDuty: facts.type.name,
		month,
		weekendMode: facts.form.rules.weekendMode,
		columns,
		rows: rowIds.map(ref),
		cells,
		remarks: remarks(run, month, days, ref)
	};
}

function whenOf(day: RosterDay): 'served' | 'planned' {
	return day.detail?.kind === 'stored' && day.detail.served ? 'served' : 'planned';
}

function personRefs(facts: RosterFacts): (personId: string) => PersonRef {
	const people = new Map(facts.people.map((person) => [person.id, person]));
	return (personId) => {
		const person = people.get(personId);
		return {
			personId,
			rank: person?.rank ?? '',
			lastName: person?.lastName ?? '',
			firstName: person?.firstName ?? ''
		};
	};
}

function remarks(
	run: RosterRun,
	month: MonthKey,
	days: readonly RosterDay[],
	ref: (personId: string) => PersonRef
): Da6Remark[] {
	const { form, window } = run.facts;
	const from = [`${month}-01`, form.startsOn].sort()[1];
	const through = [`${month}-31`, window.through].sort()[0];
	const dated: { date: DateKey; remark: Da6Remark }[] = [];
	for (const excusal of run.facts.excusals) {
		if (excusal.from > through || (excusal.through !== null && excusal.through < from)) continue;
		dated.push({
			date: excusal.from,
			remark: {
				kind: 'excused',
				who: ref(excusal.personId),
				reason: excusal.reason,
				from: excusal.from,
				through: excusal.through
			}
		});
	}
	for (const change of run.poolChanges) {
		if (!change.date.startsWith(month)) continue;
		const who = ref(change.personId);
		if (change.kind === 'leave' && change.cause !== 'excused') {
			dated.push({ date: change.date, remark: { kind: 'left', who, on: change.date, cause: change.cause } });
		}
		if (change.kind === 'enter' && change.cause !== 'form-start' && change.cause !== 'reinstated') {
			dated.push({ date: change.date, remark: { kind: 'joined', who, on: change.date, cause: change.cause } });
		}
	}
	for (const day of days) {
		if (day.detail?.kind === 'stored' && !day.detail.onRoster) {
			dated.push({ date: day.date, remark: { kind: 'outside', who: ref(day.detail.personId), date: day.date } });
		}
	}
	return dated.sort((a, b) => a.date.localeCompare(b.date)).map(({ remark }) => remark);
}

/**
 * Closes the open form on `closeOn`. `facts` must cover the whole form, D and U included,
 * because the saved cells carry codes. The same facts give the same record.
 */
export function closeForm(
	facts: RosterFacts,
	closeOn: DateKey
): { readonly segments: readonly Da6Segment[]; readonly carry: readonly StartingNumber[] } {
	const run = simulateRoster({ ...facts, window: { from: facts.form.startsOn, through: closeOn } });
	const months: MonthKey[] = [];
	for (let month = facts.form.startsOn.slice(0, 7); month <= closeOn.slice(0, 7); month = nextMonth(month)) {
		months.push(month);
	}
	return {
		segments: months.flatMap((month) => segment(run, month, 'closed') ?? []),
		carry: run.end.entries.map((entry) => ({
			personId: entry.personId,
			track: entry.track,
			count: entry.count,
			origin: 'carried'
		}))
	};
}

function nextMonth(month: MonthKey): MonthKey {
	const [year, value] = month.split('-').map(Number);
	return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`;
}

/**
 * Maps carried numbers across a weekend-mode change. Separate to Same or None carries the weekday count.
 * Same or None to Separate copies the count to both tracks. Same and None share one sequence.
 */
export function carryOver(carry: readonly StartingNumber[], from: WeekendMode, to: WeekendMode): StartingNumber[] {
	if (from === to) return [...carry];
	const primary: TrackId = from === 'same' ? 'all' : 'weekday';
	return carry
		.filter((number) => number.track === primary)
		.flatMap((number) => tracksOf(to).map((track) => ({ ...number, track })));
}
