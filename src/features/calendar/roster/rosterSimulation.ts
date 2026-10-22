import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { trackOf, tracksOf } from './rosterCalendar';
import { compilePoolRules, inDa6Order, poolEvents } from './rosterPool';
import type {
	DayDetail,
	Effect,
	PickPlan,
	PlannedChange,
	PoolChange,
	RosterAssignment,
	RosterCheckpoint,
	RosterDay,
	RosterFacts,
	RosterRun,
	Standing,
	TrackCounts
} from './rosterTypes';

const AVAILABLE: Effect = { code: 'available' };
const PRECEDENCE: Record<Effect['code'], number> = { available: 0, D: 1, U: 2, A: 3 };
const NEVER = 0;
const ON = 1;
const LEFT = 2;

/** The only derivation of counts and picks. Pure and deterministic, with no lookback limit. */
export function simulateRoster(facts: RosterFacts, plan: PickPlan = { kind: 'stored' }): RosterRun {
	const start = toDayNumber(facts.form.startsOn);
	const windowFrom = toDayNumber(facts.window.from);
	const end = toDayNumber(facts.window.through);
	const today = toDayNumber(facts.today);
	let fill: { from: number; through: number } | null = null;
	if (plan.kind === 'fill') {
		fill = { from: toDayNumber(plan.days.from), through: toDayNumber(plan.days.through) };
		if (fill.from < windowFrom || fill.through > end) {
			throw new RangeError(`Fill days ${plan.days.from} to ${plan.days.through} lie outside the window.`);
		}
	}
	const repickAfter = plan.kind === 'repick' ? Math.max(toDayNumber(plan.after), today) : Infinity;

	const mode = facts.form.rules.weekendMode;
	const tracks = tracksOf(mode);
	const people = inDa6Order(facts.people, facts.rankCatalog);
	const n = people.length;
	const slotOf = new Map(people.map((person, slot) => [person.id, slot]));
	const holidays = new Set<number>(facts.holidays.map(toDayNumber));
	const span = Math.max(0, end - start + 1);
	// Facts repeat the same few thousand dates, and parsing dominated a three-year run.
	const parsed = new Map<string, number>();
	const dayOf = (date: string) => {
		let day = parsed.get(date);
		if (day === undefined) parsed.set(date, (day = toDayNumber(date)));
		return day;
	};

	// One effect id per (person, day) over the form. Ids index `effects` and `precedence`; 0 is available.
	const effects: Effect[] = [AVAILABLE];
	const precedence: number[] = [PRECEDENCE.available];
	const register = (effect: Effect) => {
		precedence.push(PRECEDENCE[effect.code]);
		return effects.push(effect) - 1;
	};
	const effectAt = new Uint16Array(span * n);
	const mark = (slot: number | undefined, from: number, through: number, id: number) => {
		if (slot === undefined) return;
		for (let day = Math.max(from, start); day <= Math.min(through, end); day++) {
			const at = (day - start) * n + slot;
			if (precedence[effectAt[at]] < precedence[id]) effectAt[at] = id;
		}
	};
	const statusIds = new Map(
		facts.statusTypes.flatMap((status) =>
			status.rosterEffect === 'available'
				? []
				: [[status.id, register({ code: status.rosterEffect, reason: status.name })] as const]
		)
	);
	for (const entry of facts.availability) {
		const id = statusIds.get(entry.statusTypeId);
		if (id !== undefined) mark(slotOf.get(entry.personnelId), dayOf(entry.startDate), dayOf(entry.endDate), id);
	}
	const own = new Map<number, RosterAssignment>();
	const otherIds = new Map<string, number>();
	for (const assignment of facts.assignments) {
		const day = dayOf(assignment.date);
		const typeId = assignment.assignmentTypeId;
		if (typeId === facts.type.id) {
			own.set(day, assignment);
			continue;
		}
		let id = otherIds.get(typeId);
		if (id === undefined) {
			id = register({ code: 'D', reason: facts.assignmentTypeNames.get(typeId) ?? typeId });
			otherIds.set(typeId, id);
		}
		mark(slotOf.get(assignment.assigneeId), day, day, id);
	}

	const starting = tracks.map(
		(track) =>
			new Map(
				facts.form.startingNumbers
					.filter((number) => number.track === track)
					.map((number) => [number.personId, number.count])
			)
	);
	const counts = tracks.map(() => new Int32Array(n));
	const awayOnLastDetail = tracks.map(() => new Array<string | null>(n).fill(null));
	const state = new Uint8Array(n);
	let members: number[] = [];

	const events = poolEvents({
		people,
		excusals: facts.excusals,
		matches: compilePoolRules(facts.form.rules.pool, facts.rankCatalog),
		from: start,
		through: end
	});
	let nextEvent = 0;

	const days: RosterDay[] = [];
	const poolChanges: PoolChange[] = [];
	const changes: PlannedChange[] = [];
	const unfilled: string[] = [];
	const excludedDates: string[] = [];
	const next = new Int32Array(n);
	const effectOf = new Uint16Array(n);
	let current: readonly TrackCounts[] | null = null;
	const captureCurrent = () => {
		if (today < Math.max(start, windowFrom) || today > end) return;
		const base = (today - start) * n;
		current = tracks.map((track, ti) => ({
			track,
			counts: [...members]
				.sort((a, b) => counts[ti][b] - counts[ti][a] || a - b)
				.map((slot) => ({
					personId: people[slot].id,
					count: counts[ti][slot],
					effect: effects[effectAt[base + slot]]
				}))
		}));
	};

	for (let day = start; day <= end; day++) {
		if (day === today + 1) captureCurrent();
		if (nextEvent < events.length && events[nextEvent].day === day) {
			const entrants: number[] = [];
			for (; nextEvent < events.length && events[nextEvent].day === day; nextEvent++) {
				const { change } = events[nextEvent];
				const slot = slotOf.get(change.personId)!;
				poolChanges.push(change);
				if (change.kind === 'leave') state[slot] = LEFT;
				else entrants.push(slot);
			}
			// A blank starting number reads the lowest count among members and same-day entrants with a count,
			// so a blank box on a copied paper form lands with the pool rather than at 0.
			const present = slotsWhere(state, ON);
			tracks.forEach((_, ti) => {
				const known = present.map((slot) => counts[ti][slot]);
				const blanks: number[] = [];
				for (const slot of entrants) {
					const count = state[slot] === NEVER ? starting[ti].get(people[slot].id) : counts[ti][slot];
					if (count === undefined) blanks.push(slot);
					else known.push((counts[ti][slot] = count));
				}
				const lowest = known.length ? Math.min(...known) : 0;
				for (const slot of blanks) counts[ti][slot] = lowest;
			});
			for (const slot of entrants) state[slot] = ON;
			members = slotsWhere(state, ON);
		}

		const track = trackOf(mode, day, holidays);
		const stored = own.get(day);
		const inWindow = day >= windowFrom;
		if (track === null) {
			if (stored && inWindow) excludedDates.push(fromDayNumber(day));
			continue;
		}
		const picking = fill
			? !stored && day >= fill.from && day <= fill.through
			: stored?.source === 'roster' && day > repickAfter && inWindow;
		if (!stored && !picking && !inWindow) continue;

		const ti = tracks.indexOf(track);
		const count = counts[ti];
		const base = (day - start) * n;
		let best = -1;
		for (const slot of members) {
			const id = effectAt[base + slot];
			effectOf[slot] = id;
			next[slot] = precedence[id] === PRECEDENCE.A ? count[slot] : count[slot] + 1;
			if (id === 0 && (best < 0 || next[slot] > next[best])) best = slot;
		}

		const rulePick = best < 0 ? null : people[best].id;
		const storedId = stored?.assigneeId ?? null;
		const assigneeId = picking ? (rulePick ?? storedId) : storedId;
		const assigneeSlot = assigneeId === null ? undefined : slotOf.get(assigneeId);
		const onRoster = assigneeSlot !== undefined && state[assigneeSlot] === ON;
		const planned = picking && rulePick !== null && rulePick !== storedId;

		if (inWindow || picking) {
			const date = fromDayNumber(day);
			const standing: Standing[] = [...members]
				.sort((a, b) => next[b] - next[a] || a - b)
				.map((slot) => ({ personId: people[slot].id, count: next[slot], effect: effects[effectOf[slot]] }));
			if (picking && rulePick === null) unfilled.push(date);
			if (planned) {
				changes.push({
					date,
					track,
					personId: rulePick,
					count: next[best],
					was: storedId,
					passedOver: standing.slice(
						0,
						standing.findIndex((entry) => entry.personId === rulePick)
					),
					returningFrom: awayOnLastDetail[ti][best]
				});
			}
			if (inWindow) {
				let detail: DayDetail | null = null;
				if (planned) {
					detail = { kind: 'planned', personId: rulePick, was: storedId };
				} else if (stored) {
					detail = {
						kind: 'stored',
						personId: stored.assigneeId,
						source: stored.source,
						served: day <= today,
						onRoster,
						effect: assigneeSlot === undefined ? AVAILABLE : effects[effectAt[base + assigneeSlot]]
					};
				}
				days.push({ date, track, detail, standing, rulePick });
			}
		}

		if (assigneeId === null) continue;
		for (const slot of members) {
			count[slot] = next[slot];
			const effect = effects[effectOf[slot]];
			awayOnLastDetail[ti][slot] = effect.code === 'A' ? effect.reason : null;
		}
		if (onRoster) count[assigneeSlot!] = 0;
	}
	if (end === today) captureCurrent();

	const entries: RosterCheckpoint['entries'][number][] = [];
	for (let slot = 0; slot < n; slot++) {
		tracks.forEach((track, ti) => {
			const count = state[slot] === NEVER ? starting[ti].get(people[slot].id) : counts[ti][slot];
			if (count !== undefined) entries.push({ personId: people[slot].id, track, count, onRoster: state[slot] === ON });
		});
	}

	return {
		facts,
		days,
		byDate: new Map(days.map((day) => [day.date, day])),
		current,
		poolChanges,
		changes,
		unfilled,
		excludedDates,
		end: { formId: facts.form.id, after: facts.window.through, entries }
	};
}

function slotsWhere(state: Uint8Array, value: number): number[] {
	const slots: number[] = [];
	for (let slot = 0; slot < state.length; slot++) if (state[slot] === value) slots.push(slot);
	return slots;
}

/** Replaces this type's assignment on `date`, keeping one assignment per type per day. */
export function withAssignment(facts: RosterFacts, change: Omit<RosterAssignment, 'assignmentTypeId'>): RosterFacts {
	const typeId = facts.type.id;
	return {
		...facts,
		assignments: [
			...facts.assignments.filter(
				(assignment) => assignment.assignmentTypeId !== typeId || assignment.date !== change.date
			),
			{ ...change, assignmentTypeId: typeId }
		]
	};
}

/** True once any detail on this form is dated on or before today. Carried numbers are read-only regardless. */
export function startingNumbersLocked(facts: RosterFacts): boolean {
	if (facts.form.startingNumbers.some((number) => number.origin === 'carried')) return true;
	const holidays = new Set(facts.holidays.map(toDayNumber));
	return facts.assignments.some(
		(assignment) =>
			assignment.assignmentTypeId === facts.type.id &&
			assignment.date >= facts.form.startsOn &&
			assignment.date <= facts.today &&
			trackOf(facts.form.rules.weekendMode, toDayNumber(assignment.date), holidays) !== null
	);
}
