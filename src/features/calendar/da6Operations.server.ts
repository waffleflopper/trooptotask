import { fail } from '$lib/errors';
import { isUuid } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import { loadRosterFacts, type RosterSettingsPorts } from './rosterSettingsOperations.server';
import { da6Segment, simulateRoster, type DateKey, type MonthKey } from './roster/rosterEngine';
import { lastDayOf, type Da6Sheet, type Da6View } from './utils/da6View';

const later = (a: DateKey, b: DateKey) => (a > b ? a : b);
const earlier = (a: DateKey, b: DateKey) => (a < b ? a : b);

/**
 * One roster's DA 6 for one month: closed forms from their saved record, the open form derived from facts.
 * The pool spans every Group, so only an Organization-wide Calendar viewer may read it.
 */
export async function loadDa6View(
	ctx: RosterSettingsPorts,
	{ typeId, month, today }: { typeId: string; month: MonthKey; today: DateKey }
): Promise<Da6View> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability, { kind: 'organization' });
	if (!isUuid(typeId)) fail(404, 'That duty roster is not available.');

	const monthStart = `${month}-01`;
	const monthEnd = lastDayOf(month);
	const types = ctx.calendarCatalogs.listAssignmentTypes();
	const [allTypes, closedForms, openSheet] = await Promise.all([
		types,
		ctx.calendarCatalogs.listClosedRosterForms(typeId, month),
		Promise.all([types, ctx.calendarCatalogs.findOpenRosterForm(typeId)]).then(
			async ([list, form]): Promise<Da6Sheet | null> => {
				const type = list.find((candidate) => candidate.id === typeId);
				if (!type || !form || form.startsOn > monthEnd) return null;
				const run = simulateRoster(await loadRosterFacts(ctx, type, form, today, monthEnd));
				const segment = da6Segment(run, month);
				return (
					segment && {
						formId: form.id,
						from: later(monthStart, form.startsOn),
						to: today > monthEnd ? monthEnd : null,
						segment
					}
				);
			}
		)
	]);

	const rosters = allTypes
		.filter((type) => type.assignTo === 'personnel' && !type.archivedAt)
		.map(({ id, name, shortName }) => ({ id, name, shortName }));
	const roster = allTypes.find((type) => type.id === typeId && type.assignTo === 'personnel');
	if (!roster) fail(404, 'That duty roster is not available.');

	// A form that held no duty this month has no sheet. One whose record cannot be read keeps its place as an error.
	const closedSheets = closedForms.flatMap((form): Da6Sheet[] =>
		form.readable && !form.segment
			? []
			: [
					{
						formId: form.id,
						from: later(monthStart, form.startsOn),
						to: earlier(form.endsOn, monthEnd),
						segment: form.readable ? form.segment : null
					}
				]
	);
	return {
		rosters,
		roster: { id: roster.id, name: roster.name, shortName: roster.shortName },
		month,
		today,
		sheets: openSheet ? [...closedSheets, openSheet] : closedSheets
	};
}
