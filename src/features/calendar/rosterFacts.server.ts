import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { OrganizationRankCatalogEntry, PersonnelCalendarRosterPort } from '$features/personnel/contracts';
import type { CalendarCatalogPorts } from './calendarPolicy.server';
import type { CalendarAssignmentReader, CalendarAvailabilityPersistence, SavedAssignmentType } from './contracts';
import type { DateKey, DateSpan, Excusal, OpenForm, RosterAssignment, RosterFacts } from './roster/rosterTypes';

export interface RosterFactsPorts extends CalendarCatalogPorts {
	calendarAvailability: Pick<CalendarAvailabilityPersistence, 'listOverlapping'>;
	calendarAssignments: Pick<CalendarAssignmentReader, 'listRange' | 'listRosterDetailDays'>;
	personnelCalendarRoster: Pick<PersonnelCalendarRosterPort, 'listAttributeTimelines'>;
	loadRankCatalog: () => Promise<OrganizationRankCatalogEntry[]>;
}

export const addDays = (date: DateKey, days: number) => fromDayNumber(toDayNumber(date) + days);

type PeopleFacts = Pick<RosterFacts, 'people' | 'rankCatalog' | 'statusTypes'>;
type CalendarFacts = Pick<RosterFacts, 'availability' | 'holidays'>;

/** The Organization-wide reads that do not depend on dates. */
export async function readRosterPeople(ctx: RosterFactsPorts): Promise<PeopleFacts> {
	const [timelines, rankCatalog, statusTypes] = await Promise.all([
		ctx.personnelCalendarRoster.listAttributeTimelines(ctx.auth),
		ctx.loadRankCatalog(),
		ctx.calendarCatalogs.listStatusTypes()
	]);
	return {
		people: timelines.map((person) => ({
			id: person.id,
			rank: person.rank,
			lastName: person.lastName,
			firstName: person.firstName,
			states: person.states.map(({ archived, ...state }) => ({ ...state, active: !archived })) as [
				RosterFacts['people'][number]['states'][number],
				...RosterFacts['people'][number]['states']
			]
		})),
		rankCatalog,
		statusTypes: statusTypes.map(({ id, name, rosterEffect }) => ({ id, name, rosterEffect }))
	};
}

/** Availability and Special Days from `span.from` through `span.through`. */
export async function readRosterCalendar(ctx: RosterFactsPorts, span: DateSpan): Promise<CalendarFacts> {
	const range = { rangeStart: span.from, rangeEnd: span.through };
	const [availability, specialDays] = await Promise.all([
		ctx.calendarAvailability.listOverlapping(range),
		ctx.calendarCatalogs.listSpecialDays(range)
	]);
	return { availability, holidays: specialDays.map(({ date }) => date) };
}

export function rosterFacts(
	shared: PeopleFacts & CalendarFacts & { assignmentTypeNames: ReadonlyMap<string, string> },
	roster: {
		today: DateKey;
		window: DateSpan;
		type: Pick<SavedAssignmentType, 'id' | 'name'>;
		form: OpenForm;
		excusals: readonly Excusal[];
		assignments: readonly RosterAssignment[];
	}
): RosterFacts {
	return { ...shared, ...roster, type: { id: roster.type.id, name: roster.type.name } };
}

const personTypeNames = (types: readonly SavedAssignmentType[]) =>
	new Map(types.filter((type) => type.assignTo === 'personnel').map((type) => [type.id, type.name]));

/**
 * The facts of every live roster over `window`, or of `typeIds` only. The Organization-wide facts are read once,
 * and each person-assigned type's duty days with one query from the earlier of its open form's start and the
 * window's day before, so counts are exact and other rosters' D covers the window plus a day each side.
 */
export async function loadRosters(
	ctx: RosterFactsPorts,
	input: { today: DateKey; window: DateSpan; typeIds?: readonly string[] }
): Promise<RosterFacts[]> {
	const types = await ctx.calendarCatalogs.listAssignmentTypes();
	const names = personTypeNames(types);
	const wanted = types.filter(
		(type) => type.assignTo === 'personnel' && !type.archivedAt && (!input.typeIds || input.typeIds.includes(type.id))
	);
	const rosters = (
		await Promise.all(
			wanted.map(async (type) => {
				const [form, excusals] = await Promise.all([
					ctx.calendarCatalogs.findOpenRosterForm(type.id),
					ctx.calendarCatalogs.listRosterExcusals(type.id)
				]);
				return form ? [{ type, form, excusals }] : [];
			})
		)
	).flat();
	if (!rosters.length) return [];

	const people = readRosterPeople(ctx);
	const before = addDays(input.window.from, -1);
	const after = addDays(input.window.through, 1);
	const startOf = new Map(rosters.map(({ type, form }) => [type.id, addDays(form.startsOn, -1)]));
	const earliest = [before, ...startOf.values()].reduce((a, b) => (a < b ? a : b));
	const [shared, calendar, days] = await Promise.all([
		people,
		readRosterCalendar(ctx, { from: earliest, through: after }),
		Promise.all(
			[...names.keys()].map(async (typeId) => {
				const start = startOf.get(typeId);
				const from = start !== undefined && start < before ? start : before;
				const rows = await ctx.calendarAssignments.listRosterDetailDays(typeId, { from, through: after });
				return rows.map(({ date, assigneeId, source }) => ({ date, assignmentTypeId: typeId, assigneeId, source }));
			})
		)
	]);
	const assignments = days.flat();
	return rosters.map(({ type, form, excusals }) =>
		rosterFacts(
			{ ...shared, ...calendar, assignmentTypeNames: names },
			{ today: input.today, window: input.window, type, form, excusals, assignments }
		)
	);
}
