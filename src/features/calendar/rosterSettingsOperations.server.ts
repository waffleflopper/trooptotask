import { error } from '@sveltejs/kit';
import type { OrganizationRankCatalogEntry, PersonnelCalendarRosterPort } from '$features/personnel/contracts';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy, type CalendarCatalogPorts } from './calendarPolicy.server';
import { rosterSettingsInput } from './calendarPersistenceMapping.server';
import { DEVICE_DATE_MESSAGE } from './calendarCatalogPersistence.server';
import {
	normalizePoolRules,
	type CalendarAssignmentReader,
	type CalendarAvailabilityPersistence,
	type SavedAssignmentType
} from './contracts';
import { carryOver, closeForm } from './roster/rosterEngine';
import type { OpenForm, RosterFacts, RosterRules } from './roster/rosterTypes';

export interface RosterSettingsPorts extends CalendarCatalogPorts {
	calendarAvailability: Pick<CalendarAvailabilityPersistence, 'listOverlapping'>;
	calendarAssignments: Pick<CalendarAssignmentReader, 'listRange'>;
	personnelCalendarRoster: Pick<PersonnelCalendarRosterPort, 'listAttributeTimelines'>;
	loadRankCatalog: () => Promise<OrganizationRankCatalogEntry[]>;
}

const action = CALENDAR_POLICY_ACTIONS.configureAssignmentTypes;
const resource = { kind: 'organization' } as const;

const addDays = (date: string, days: number) => fromDayNumber(toDayNumber(date) + days);
const utcDate = (offsetDays: number) => addDays(new Date().toISOString().slice(0, 10), offsetDays);

const sameRules = (a: RosterRules, b: RosterRules) =>
	a.weekendMode === b.weekendMode &&
	JSON.stringify(a.pool && normalizePoolRules(a.pool)) === JSON.stringify(b.pool && normalizePoolRules(b.pool));

/**
 * Saves one roster's settings. Excusals change in place. Changed rules close the open DA 6 form on `today`
 * with the record the engine computes, and the next form opens tomorrow carrying everyone's count.
 * Each step converges, so a retry after a partial failure finishes the save.
 */
export async function saveRosterSettings(
	ctx: RosterSettingsPorts,
	input: Record<string, unknown>
): Promise<SavedAssignmentType> {
	const parsed = rosterSettingsInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { id, poolRules, weekendMode, excusals, today } = parsed.data;
	if (today < utcDate(-1) || today > utcDate(1)) fail(400, DEVICE_DATE_MESSAGE);
	await requireCalendarPolicy(ctx, action, resource);

	const type = await findRosterType(ctx, id);
	const excusalKey = (list: readonly { personId: string; reason: string }[]) =>
		JSON.stringify(list.map(({ personId, reason }) => [personId, reason]).sort());
	const excusalsChanged = excusalKey(type.excusals) !== excusalKey(excusals);
	const rules: RosterRules = { pool: poolRules, weekendMode };
	const rulesChanged = !sameRules({ pool: type.poolRules, weekendMode: type.weekendMode }, rules);

	if (excusalsChanged) {
		await ctx.calendarCatalogs.setRosterExcusals(id, today, excusals);
		ctx.audit.log({
			action: 'assignment_type.roster_excusals_set',
			resourceType: 'assignment_type',
			resourceId: id,
			details: { personnelIds: excusals.map(({ personId }) => personId) }
		});
	}
	if (rulesChanged) {
		const form = await ctx.calendarCatalogs.findOpenRosterForm(id);
		if (!form) fail(409, 'This roster changed while you were editing. Reload and try again.');
		const formId = await ctx.calendarCatalogs.closeRosterForm({
			assignmentTypeId: id,
			formId: form.id,
			today,
			poolRules,
			weekendMode,
			...(await closing(ctx, type, form, today, weekendMode))
		});
		ctx.audit.log({
			action: 'assignment_type.roster_form_closed',
			resourceType: 'assignment_type',
			resourceId: id,
			details: { closedFormId: formId === form.id ? null : form.id, openFormId: formId, rules }
		});
	}
	return excusalsChanged || rulesChanged ? findRosterType(ctx, id) : type;
}

async function findRosterType(ctx: RosterSettingsPorts, id: string): Promise<SavedAssignmentType> {
	const type = (await ctx.calendarCatalogs.listAssignmentTypes()).find((candidate) => candidate.id === id);
	if (!type || type.assignTo !== 'personnel') fail(404, 'That assignment type is no longer available.');
	return type;
}

/** A form that has not started yet has no day to record, so it takes the new rules in place. */
async function closing(
	ctx: RosterSettingsPorts,
	type: SavedAssignmentType,
	form: OpenForm,
	today: string,
	weekendMode: RosterRules['weekendMode']
) {
	if (form.startsOn > today)
		return { record: null, carry: carryOver(form.startingNumbers, form.rules.weekendMode, weekendMode) };
	const { segments, carry } = closeForm(await loadRosterFacts(ctx, type, form, today), today);
	return { record: { segments }, carry: carryOver(carry, form.rules.weekendMode, weekendMode) };
}

/** The whole open form's facts through `today`, plus the day each side the engine reads for D and U. */
export async function loadRosterFacts(
	ctx: RosterSettingsPorts,
	type: Pick<SavedAssignmentType, 'id' | 'name'>,
	form: OpenForm,
	today: string
): Promise<RosterFacts> {
	const range = { rangeStart: addDays(form.startsOn, -1), rangeEnd: addDays(today, 1) };
	const [timelines, excusals, rankCatalog, statusTypes, types, availability, specialDays, assignments] =
		await Promise.all([
			ctx.personnelCalendarRoster.listAttributeTimelines(ctx.auth),
			ctx.calendarCatalogs.listRosterExcusals(type.id),
			ctx.loadRankCatalog(),
			ctx.calendarCatalogs.listStatusTypes(),
			ctx.calendarCatalogs.listAssignmentTypes(),
			ctx.calendarAvailability.listOverlapping(range),
			ctx.calendarCatalogs.listSpecialDays(range),
			ctx.calendarAssignments.listRange(range)
		]);
	const personTypes = new Map(types.filter((t) => t.assignTo === 'personnel').map((t) => [t.id, t.name]));
	return {
		today,
		window: { from: form.startsOn, through: today },
		type: { id: type.id, name: type.name },
		form,
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
		excusals,
		rankCatalog,
		// Status types gain their roster effect in a later release. Until then every status keeps a person off duty.
		statusTypes: statusTypes.map(({ id, name }) => ({ id, name, rosterEffect: 'A' as const })),
		availability,
		holidays: specialDays.map(({ date }) => date),
		assignments: assignments
			.filter(({ assignmentTypeId }) => personTypes.has(assignmentTypeId))
			.map(({ date, assignmentTypeId, assigneeId }) => ({ date, assignmentTypeId, assigneeId, source: 'manual' })),
		assignmentTypeNames: personTypes
	};
}
