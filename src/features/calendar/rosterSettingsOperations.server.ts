import { error } from '@sveltejs/kit';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import { rosterSettingsInput } from './calendarPersistenceMapping.server';
import { DEVICE_DATE_MESSAGE } from './calendarCatalogPersistence.server';
import { normalizePoolRules, type SavedAssignmentType } from './contracts';
import { carryOver, closeForm } from './roster/rosterEngine';
import {
	addDays,
	readRosterCalendar,
	readRosterPeople,
	rosterFacts,
	type RosterFactsPorts
} from './rosterFacts.server';
import type { OpenForm, RosterFacts, RosterRules } from './roster/rosterTypes';
import { MAX_CALENDAR_RANGE_DAYS } from './utils/calendarRange';

export type RosterSettingsPorts = RosterFactsPorts;

const action = CALENDAR_POLICY_ACTIONS.configureAssignmentTypes;
const resource = { kind: 'organization' } as const;

const utcDate = (offsetDays: number) => addDays(new Date().toISOString().slice(0, 10), offsetDays);

/** The device day must sit within a day of the server's UTC day, so a wrong clock cannot place a form boundary. */
export function requireDeviceDate(today: string | undefined): asserts today is string {
	if (!today || today < utcDate(-1) || today > utcDate(1)) fail(400, DEVICE_DATE_MESSAGE);
}

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
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, action, resource);

	const type = await findRosterType(ctx, id);
	const excusalKey = (list: readonly { personId: string; reason: string }[]) =>
		JSON.stringify(list.map(({ personId, reason }) => [personId, reason]).sort());
	const excusalsChanged = excusalKey(type.excusals) !== excusalKey(excusals);
	const rules: RosterRules = { pool: poolRules, weekendMode };
	const rulesChanged = !sameRules({ pool: type.poolRules, weekendMode: type.weekendMode }, rules);

	if (excusalsChanged) {
		await ctx.calendarCatalogs.setRosterExcusals(id, today, excusals);
		await ctx.audit.log({
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
		await ctx.audit.log({
			action: 'assignment_type.roster_form_closed',
			resourceType: 'assignment_type',
			resourceId: id,
			details: { closedFormId: formId === form.id ? null : form.id, openFormId: formId, rules }
		});
	}
	return excusalsChanged || rulesChanged ? findRosterType(ctx, id) : type;
}

/**
 * A type that becomes a Group assignment closes its open DA 6 form on `today` with the record the engine computes,
 * and keeps no form. Resolves without a change when the type keeps no form.
 */
export async function endRoster(ctx: RosterSettingsPorts, id: string, today: string | undefined): Promise<void> {
	const form = await ctx.calendarCatalogs.findOpenRosterForm(id);
	if (!form) return;
	requireDeviceDate(today);
	const { record } = await closing(ctx, await findRosterType(ctx, id), form, today, form.rules.weekendMode);
	await ctx.calendarCatalogs.endRosterForm({ assignmentTypeId: id, formId: form.id, today, record });
	await ctx.audit.log({
		action: 'assignment_type.roster_form_closed',
		resourceType: 'assignment_type',
		resourceId: id,
		details: { closedFormId: record ? form.id : null, openFormId: null, rules: null }
	});
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

/**
 * The whole open form's facts through `through` (today unless a caller reads planned days too), capped at today
 * plus the Calendar's planning horizon, plus the day each side the engine reads for D and U. This type's duty days
 * include those of deleted assignees, which still moved everyone else's count.
 */
export async function loadRosterFacts(
	ctx: RosterSettingsPorts,
	type: Pick<SavedAssignmentType, 'id' | 'name'>,
	form: OpenForm,
	today: string,
	through: string = today
): Promise<RosterFacts> {
	const horizon = addDays(today, MAX_CALENDAR_RANGE_DAYS);
	const window = { from: form.startsOn, through: through < horizon ? through : horizon };
	const span = { from: addDays(window.from, -1), through: addDays(window.through, 1) };
	const [people, calendar, excusals, types, assignments, detailDays, swaps] = await Promise.all([
		readRosterPeople(ctx, span),
		readRosterCalendar(ctx, span),
		ctx.calendarCatalogs.listRosterExcusals(type.id, window),
		ctx.calendarCatalogs.listAssignmentTypes(),
		ctx.calendarAssignments.listRange({ rangeStart: span.from, rangeEnd: span.through }),
		ctx.calendarAssignments.listRosterDetailDays(type.id, span),
		ctx.calendarCatalogs.listRosterSwaps(type.id, window)
	]);
	const personTypes = new Map(types.filter((t) => t.assignTo === 'personnel').map((t) => [t.id, t.name]));
	return rosterFacts(
		{ ...people, ...calendar, assignmentTypeNames: personTypes },
		{
			today,
			window,
			type,
			form,
			excusals,
			swaps,
			assignments: [
				...assignments
					.filter(({ assignmentTypeId }) => assignmentTypeId !== type.id && personTypes.has(assignmentTypeId))
					.map(({ date, assignmentTypeId, assigneeId }) => ({
						date,
						assignmentTypeId,
						assigneeId,
						source: 'manual' as const
					})),
				...detailDays.map(({ date, assigneeId, source }) => ({ date, assignmentTypeId: type.id, assigneeId, source }))
			]
		}
	);
}
