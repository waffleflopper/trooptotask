import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { fail } from '$lib/errors';
import { dateOnlySchema, isUuid, issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { formatDayMonth } from '$lib/utils/dates';
import { toDayNumber } from '$lib/utils/dayNumber';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import { STARTING_NUMBERS_LOCKED } from './dailyAssignmentPersistence.server';
import type { SavedAssignment, SavedAssignmentType, StartingNumbersStatus } from './contracts';
import { addDays, readRosterPeople, rosterFacts } from './rosterFacts.server';
import type { RosterPlannerPorts } from './rosterPlannerOperations.server';
import { loadRosterFacts, requireDeviceDate, type RosterSettingsPorts } from './rosterSettingsOperations.server';
import { poolOn, simulateRoster, startingNumbersLocked, tracksOf } from './roster/rosterEngine';
import { trackOf } from './roster/rosterCalendar';
import type { DateKey, OpenForm, PersonRef, RosterPerson } from './roster/rosterTypes';
import type { Da6Setup, Da6SetupForm } from './utils/da6View';

const MAX_COUNT = 9999;
/** Roster picks can sit anywhere ahead of today, so the re-pick read runs to the end of the calendar. */
const LAST_DAY = '9999-12-31';
/** A track's first day is at most a week out, unless a long run of holidays pushes it. */
const COLUMN_SEARCH_DAYS = 62;

const later = (a: DateKey, b: DateKey) => (a > b ? a : b);

const startingNumbersInput = z
	.object({
		typeId: uuidSchema,
		formId: uuidSchema,
		today: dateOnlySchema,
		numbers: z
			.array(
				z
					.object({
						personId: uuidSchema,
						track: z.enum(['all', 'weekday', 'weekend']),
						count: z.number().int().min(0).max(MAX_COUNT).nullable()
					})
					.strict()
			)
			.max(2000)
	})
	.strict();

async function findRoster(ctx: RosterSettingsPorts, typeId: string) {
	if (!isUuid(typeId)) fail(404, 'That duty roster is not available.');
	const [types, form] = await Promise.all([
		ctx.calendarCatalogs.listAssignmentTypes(),
		ctx.calendarCatalogs.findOpenRosterForm(typeId)
	]);
	const type = types.find((candidate) => candidate.id === typeId && candidate.assignTo === 'personnel');
	if (!type) fail(404, 'That duty roster is not available.');
	return { type, form };
}

/**
 * The open form as setup mode shows it: the first day of each track from today or the form's first day, the pool
 * that day in DA 6 order, the saved numbers, and whether they can still change. Only this type's detail days up to
 * today are read, which is all the lock needs.
 */
async function readSetup(
	ctx: RosterSettingsPorts,
	type: Pick<SavedAssignmentType, 'id' | 'name'>,
	form: OpenForm,
	today: DateKey
): Promise<Da6SetupForm> {
	const day = later(form.startsOn, today);
	const [people, specialDays, excusals, detailDays] = await Promise.all([
		readRosterPeople(ctx),
		ctx.calendarCatalogs.listSpecialDays({ rangeStart: form.startsOn, rangeEnd: addDays(day, COLUMN_SEARCH_DAYS) }),
		ctx.calendarCatalogs.listRosterExcusals(type.id),
		ctx.calendarAssignments.listRosterDetailDays(type.id, { from: form.startsOn, through: today })
	]);
	const holidays = specialDays.map(({ date }) => date);
	const facts = rosterFacts(
		{ ...people, availability: [], holidays, assignmentTypeNames: new Map() },
		{
			today,
			window: { from: form.startsOn, through: later(form.startsOn, today) },
			type,
			form,
			excusals,
			assignments: detailDays.map(({ date, assigneeId, source }) => ({
				date,
				assignmentTypeId: type.id,
				assigneeId,
				source
			}))
		}
	);
	const carried = form.startingNumbers.some((number) => number.origin === 'carried');
	const mode = form.rules.weekendMode;
	const holidayDays = new Set(holidays.map(toDayNumber));
	const columns = tracksOf(mode)
		.flatMap((track) => {
			for (let offset = 0; offset <= COLUMN_SEARCH_DAYS; offset++) {
				const date = addDays(day, offset);
				if (trackOf(mode, toDayNumber(date), holidayDays) === track) return [{ date, track }];
			}
			return [];
		})
		.sort((a, b) => a.date.localeCompare(b.date));
	const pool = poolOn({
		rules: form.rules.pool,
		people: people.people,
		excusals,
		catalog: people.rankCatalog,
		on: day
	});
	const ref = ({ id, rank, lastName, firstName }: RosterPerson): PersonRef => ({
		personId: id,
		rank,
		lastName,
		firstName
	});
	const byId = new Map(people.people.map((person) => [person.id, person]));
	return {
		id: form.id,
		state: carried ? 'carried' : startingNumbersLocked(facts) ? 'locked' : 'editable',
		weekendMode: mode,
		from: form.startsOn,
		columns,
		rows: pool.members.map(ref),
		numbers: form.startingNumbers.map(({ personId, track, count }) => ({ personId, track, count })),
		remarks: pool.excused.flatMap((excusal) => {
			const person = byId.get(excusal.personId);
			return person
				? [
						{
							kind: 'excused' as const,
							who: ref(person),
							reason: excusal.reason,
							from: excusal.from,
							through: excusal.through
						}
					]
				: [];
		})
	};
}

/** Setup mode on the DA 6 page. The pool spans every Group, so only an Organization-wide Calendar viewer may read it. */
export async function loadDa6Setup(
	ctx: RosterSettingsPorts,
	{ typeId, today }: { typeId: string; today: DateKey }
): Promise<Da6Setup> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability, { kind: 'organization' });
	const { type, form } = await findRoster(ctx, typeId);
	return {
		roster: { id: type.id, name: type.name, shortName: type.shortName },
		today,
		form: form && (await readSetup(ctx, type, form, today))
	};
}

/** Whether the type sheet offers Copy it in. Null for a type that keeps no open form. */
export async function loadStartingNumbersStatus(
	ctx: RosterSettingsPorts,
	input: Record<string, unknown>
): Promise<StartingNumbersStatus | null> {
	const parsed = z.object({ typeId: z.string(), today: dateOnlySchema }).safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { typeId, today } = parsed.data;
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability, { kind: 'organization' });
	const { type, form } = await findRoster(ctx, typeId);
	if (!form) return null;
	const { state } = await readSetup(ctx, type, form, today);
	return { state, numbered: form.startingNumbers.length > 0 };
}

/**
 * Applies the submitted numbers to the open form's typed ones, a null count clearing that box, and leaves every
 * person or track not submitted as saved. Until a detail on the form is served, the roster's planned
 * picks after today re-pick under the new numbers in the same write, and hand-assigned days stay. A re-pick nobody
 * can take is refused rather than leaving the old pick on numbers that no longer chose it.
 */
export async function saveStartingNumbers(
	ctx: RosterPlannerPorts,
	input: Record<string, unknown>
): Promise<{ saved: SavedAssignment[] }> {
	const parsed = startingNumbersInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { typeId, formId, today, numbers: submitted } = parsed.data;
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.configureAssignmentTypes, { kind: 'organization' });

	const [{ type, form }, planned] = await Promise.all([
		findRoster(ctx, typeId),
		ctx.calendarAssignments.listRosterDetailDays(typeId, { from: addDays(today, 1), through: LAST_DAY })
	]);
	if (form?.id !== formId) fail(409, 'This roster changed while you were editing. Reload and try again.');
	const tracks = tracksOf(form.rules.weekendMode);
	const keyOf = ({ personId, track }: { personId: string; track: string }) => `${personId}:${track}`;
	if (
		new Set(submitted.map(keyOf)).size !== submitted.length ||
		submitted.some(({ track }) => !tracks.includes(track))
	) {
		fail(400, 'Invalid starting numbers');
	}

	const through = planned.reduce((last, { date, source }) => (source === 'roster' && date > last ? date : last), today);
	const facts = await loadRosterFacts(ctx, type, form, today, later(through, form.startsOn));
	if (startingNumbersLocked(facts)) fail(409, STARTING_NUMBERS_LOCKED);
	const merged = new Map(
		form.startingNumbers.map(({ personId, track, count }) => [keyOf({ personId, track }), { personId, track, count }])
	);
	for (const number of submitted) {
		if (number.count === null) merged.delete(keyOf(number));
		else merged.set(keyOf(number), { ...number, count: number.count });
	}
	const numbers = [...merged.values()];
	const run = simulateRoster(
		{
			...facts,
			form: { ...form, startingNumbers: numbers.map((number) => ({ ...number, origin: 'typed' as const })) }
		},
		{ kind: 'repick', after: today }
	);
	if (run.unfilled.length) {
		fail(
			409,
			`Nobody on the roster can take ${formatDayMonth(run.unfilled[0])} with these numbers. Clear that day in the planner, then save again.`
		);
	}

	const saved = await ctx.calendarAssignmentReplacement.setRosterStartingNumbers(ctx.auth.orgId, {
		assignmentTypeId: typeId,
		formId,
		today,
		numbers,
		repicks: run.changes.map(({ date, personId, was }) => ({ date, assigneeId: personId, was: was ?? '' }))
	});
	await ctx.audit.log({
		action: 'assignment_type.roster_starting_numbers_set',
		resourceType: 'assignment_type',
		resourceId: typeId,
		details: { formId, numbers: numbers.length, repicked: saved.map(({ date }) => date) }
	});
	return { saved };
}
