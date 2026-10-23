import { error } from '@sveltejs/kit';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';
import { toDayNumber } from '$lib/utils/dayNumber';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import {
	plannerRostersInput,
	rosterDayInput,
	rosterFillInput,
	rosterFillPreviewInput,
	rosterReplacementInput,
	rosterReplacementPreviewInput
} from './calendarPersistenceMapping.server';
import type {
	CalendarAssignmentReplacementPort,
	PlannerRoster,
	RosterDay,
	RosterFillPreview,
	RosterReplacement,
	SavedAssignment
} from './contracts';
import { requireDeviceDate, type RosterSettingsPorts } from './rosterSettingsOperations.server';
import { addDays, loadRosters } from './rosterFacts.server';
import { MAX_CALENDAR_RANGE_DAYS } from './utils/calendarRange';
import {
	detailConflicts,
	poolOn,
	replacementOptions,
	simulateRoster,
	slotChanges,
	withAssignment,
	type CurrentCount,
	type Effect,
	type RosterRun
} from './roster/rosterEngine';

export interface RosterPlannerPorts extends RosterSettingsPorts {
	calendarAssignmentReplacement: Pick<CalendarAssignmentReplacementPort, 'writeRoster' | 'setRosterStartingNumbers'>;
}

const action = CALENDAR_POLICY_ACTIONS.manageAssignments;
const resource = { kind: 'unscoped' } as const;
const MAX_FILL_DAYS = 366;
const MAX_REPICK_DAYS = 366;

/** The last day a roster is simulated to, as in `loadRosterFacts`; the engine builds a standing for every day up to it. */
const planningHorizon = (today: string) => addDays(today, MAX_CALENDAR_RANGE_DAYS);

function requireWithinHorizon(first: string, today: string) {
	if (first > planningHorizon(today)) fail(400, 'Duty rosters are planned at most a year ahead.');
}

/** A roster counts everyone in the Organization, so its counts and picks are for Organization-wide operators only. */
function requireOrganizationWide(ctx: RosterSettingsPorts) {
	if (!ctx.auth.isPrivileged && ctx.auth.scopeSet.kind !== 'organization') {
		fail(403, 'Duty roster counts need Organization-wide Calendar access.');
	}
}

/** Every live roster's counts today, today's assignee, the excused, and the month's detail days and A, D and U days. */
export async function loadPlannerRosters(
	ctx: RosterSettingsPorts,
	input: Record<string, unknown>
): Promise<PlannerRoster[]> {
	const parsed = plannerRostersInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { today, month } = parsed.data;
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, action, resource);
	requireOrganizationWide(ctx);
	requireWithinHorizon(`${month}-01`, today);

	const shown = { from: `${month}-01`, through: endOfMonth(month) };
	const read = {
		from: shown.from < today ? shown.from : today,
		through: shown.through > today ? shown.through : today
	};
	const rosters = await loadRosters(ctx, { today, window: read });
	return rosters.map((facts) => {
		// The engine builds a standing for every window day, so a month away from today runs once for the month and
		// once for today rather than over every day between.
		const monthRun = simulateRoster({ ...facts, window: shown });
		const todayRun =
			today >= shown.from && today <= shown.through
				? monthRun
				: simulateRoster({ ...facts, window: { from: today, through: today } });
		return plannerRoster(monthRun, todayRun);
	});
}

function plannerRoster(monthRun: RosterRun, todayRun: RosterRun): PlannerRoster {
	const { facts } = monthRun;
	const people: string[] = [];
	const personIndex = new Map<string, number>();
	const effects: PlannerRoster['effects'] = [];
	const effectIndex = new Map<string, number>();
	const personAt = (id: string) => {
		let at = personIndex.get(id);
		if (at === undefined) personIndex.set(id, (at = people.push(id) - 1));
		return at;
	};
	const effectAt = (effect: Effect) => {
		if (effect.code === 'available') return 0;
		const key = `${effect.code}:${effect.reason}`;
		let at = effectIndex.get(key);
		if (at === undefined) effectIndex.set(key, (at = effects.push({ code: effect.code, reason: effect.reason })));
		return at;
	};
	const flat = (standing: readonly CurrentCount[]) =>
		standing.flatMap((entry) => [personAt(entry.personId), entry.count, effectAt(entry.effect)]);

	return {
		typeId: facts.type.id,
		people,
		effects,
		current: todayRun.current?.map(({ track, counts }) => ({ track, standing: flat(counts) })) ?? null,
		todayAssignee: todayRun.byDate.get(facts.today)?.detail?.personId ?? null,
		excused: facts.excusals
			.filter((excusal) => excusal.from <= facts.today && (excusal.through === null || excusal.through >= facts.today))
			.map((excusal) => excusal.personId),
		covered: monthRun.days.map((day) => day.date),
		conflicts: detailConflicts(monthRun).flatMap((day) => {
			const detail = day.detail;
			if (detail?.kind !== 'stored' || detail.effect.code === 'available') return [];
			return [{ date: day.date, personId: detail.personId, code: detail.effect.code, reason: detail.effect.reason }];
		})
	};
}

/**
 * One roster on `date`, for the duty picker: the standing going into a detail day, or else who is in the pool.
 * Null for a type with no open roster form, which keeps the plain picker.
 */
export async function loadRosterDay(
	ctx: RosterSettingsPorts,
	input: Record<string, unknown>
): Promise<RosterDay | null> {
	const parsed = rosterDayInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { typeId, today, date } = parsed.data;
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, action, resource);
	requireOrganizationWide(ctx);
	requireWithinHorizon(date, today);

	const [facts] = await loadRosters(ctx, { today, window: { from: date, through: date }, typeIds: [typeId] });
	if (!facts) return null;
	const day = simulateRoster(facts).byDate.get(date);
	if (day) {
		return {
			track: day.track,
			standing: day.standing.map(({ personId, count, effect }) => ({
				personId,
				count,
				effect: effect.code === 'available' ? null : { code: effect.code, reason: effect.reason }
			}))
		};
	}
	const { members } = poolOn({
		rules: facts.form.rules.pool,
		people: facts.people,
		excusals: facts.excusals,
		catalog: facts.rankCatalog,
		on: date
	});
	return { track: null, pool: members.map((person) => person.id) };
}

function endOfMonth(month: string): string {
	const [year, value] = month.split('-').map(Number);
	return `${month}-${String(new Date(Date.UTC(year, value, 0)).getUTCDate()).padStart(2, '0')}`;
}

async function planFill(
	ctx: RosterSettingsPorts,
	input: { typeId: string; today: string; from: string; through: string }
) {
	const { typeId, today, from } = input;
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, action, resource);
	requireOrganizationWide(ctx);
	if (from < today) fail(400, 'Fill from today or a later day.');
	if (input.through < from) fail(400, 'The last day comes before the first.');
	if (toDayNumber(input.through) - toDayNumber(from) >= MAX_FILL_DAYS)
		fail(400, `Fill at most ${MAX_FILL_DAYS} days at once.`);
	requireWithinHorizon(from, today);
	const horizon = planningHorizon(today);
	const through = input.through < horizon ? input.through : horizon;

	const [facts] = await loadRosters(ctx, { today, window: { from, through }, typeIds: [typeId] });
	if (!facts) fail(404, 'That duty roster is no longer available.');
	return simulateRoster(facts, { kind: 'fill', days: { from, through } });
}

/** The picks Fill from roster would make on the open days from `from` through `through`. Nothing is written. */
export async function previewRosterFill(
	ctx: RosterSettingsPorts,
	input: Record<string, unknown>
): Promise<RosterFillPreview> {
	const parsed = rosterFillPreviewInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const run = await planFill(ctx, parsed.data);
	return {
		picks: run.changes.map((change) => ({
			date: change.date,
			personId: change.personId,
			count: change.count,
			passedOver: change.passedOver.flatMap(({ personId, count, effect }) =>
				effect.code === 'available' ? [] : [{ personId, count, code: effect.code, reason: effect.reason }]
			),
			returningFrom: change.returningFrom
		})),
		unfilled: [...run.unfilled]
	};
}

/**
 * Writes the previewed picks as roster picks in one batch. The plan is recomputed first, and a plan that no longer
 * matches the preview is refused so the operator reviews the new picks.
 */
export async function commitRosterFill(
	ctx: RosterPlannerPorts,
	input: Record<string, unknown>
): Promise<{ saved: SavedAssignment[] }> {
	const parsed = rosterFillInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { picks, ...plan } = parsed.data;
	const run = await planFill(ctx, plan);
	const same =
		run.changes.length === picks.length &&
		run.changes.every((change, at) => change.date === picks[at].date && change.personId === picks[at].personId);
	if (!same) fail(409, 'The roster changed since this preview. Review the new picks and fill again.');

	const saved = await ctx.calendarAssignmentReplacement.writeRoster(ctx.auth.orgId, slotChanges(run));
	await ctx.audit.log({
		action: 'daily_assignment.roster_filled',
		resourceType: 'daily_assignment',
		details: { assignmentTypeId: plan.typeId, from: plan.from, through: plan.through, days: saved.length }
	});
	return { saved };
}

/**
 * Find replacement on one roster day: the day's options, and for `assigneeId`, or else the rule's pick, the later
 * roster days the change re-picks. `assigneeId` may be anyone the duty picker offers: an active person in the
 * Organization who is not excused that day, on the roster or off it, available or not. Re-picks reach at most a
 * year out.
 */
async function planReplacement(
	ctx: RosterSettingsPorts,
	input: { typeId: string; today: string; date: string; assigneeId?: string }
) {
	const { typeId, today, date } = input;
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, action, resource);
	requireOrganizationWide(ctx);
	requireWithinHorizon(date, today);

	const repickEnd = addDays(date, MAX_REPICK_DAYS);
	const horizon = repickEnd < planningHorizon(today) ? repickEnd : planningHorizon(today);
	const [facts] = await loadRosters(ctx, { today, window: { from: date, through: horizon }, typeIds: [typeId] });
	if (!facts) fail(404, 'That duty roster is no longer available.');
	// The run stops at the last planned roster day, the last day a re-pick can touch.
	const through = facts.assignments.reduce(
		(last, assignment) =>
			assignment.assignmentTypeId === typeId && assignment.source === 'roster' && assignment.date > last
				? assignment.date
				: last,
		date
	);
	const scoped = { ...facts, window: { from: date, through: through < horizon ? through : horizon } };
	const base = simulateRoster(scoped);
	const detail = base.byDate.get(date)?.detail;
	if (detail?.kind !== 'stored') fail(409, 'That day changed since the planner loaded. Refresh and try again.');

	const options = replacementOptions(base, date);
	const asked = input.assigneeId;
	const { members: pickable } = poolOn({
		rules: null,
		people: facts.people,
		excusals: facts.excusals,
		catalog: facts.rankCatalog,
		on: date
	});
	const selected =
		asked !== undefined && asked !== detail.personId && pickable.some((person) => person.id === asked)
			? asked
			: options.nextUp;
	const source = selected === options.nextUp ? ('roster' as const) : ('manual' as const);
	const repick =
		selected === null
			? null
			: simulateRoster(withAssignment(scoped, { date, assigneeId: selected, source }), { kind: 'repick', after: date });
	return { detail, options, selected, source, repick };
}

/** Find replacement's preview for a conflicted roster day. Nothing is written. */
export async function previewRosterReplacement(
	ctx: RosterSettingsPorts,
	input: Record<string, unknown>
): Promise<RosterReplacement> {
	const parsed = rosterReplacementPreviewInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { detail, options, selected, repick } = await planReplacement(ctx, parsed.data);
	const coded = (effect: Effect) => (effect.code === 'available' ? null : { code: effect.code, reason: effect.reason });
	return {
		date: parsed.data.date,
		replacing: {
			personId: detail.personId,
			count: options.day.standing.find((entry) => entry.personId === detail.personId)?.count ?? null,
			effect: coded(detail.effect)
		},
		nextUp: options.nextUp,
		candidates: options.candidates.map(({ personId, count, adjacent }) => ({
			personId,
			count,
			adjacent: adjacent.map(({ name, day }) => ({ name, day }))
		})),
		cantPull: options.cantPull.flatMap(({ personId, count, effect }) =>
			effect.code === 'available' ? [] : [{ personId, count, code: effect.code, reason: effect.reason }]
		),
		selected,
		repicks: (repick?.changes ?? []).flatMap(({ date, was, personId }) =>
			was === null ? [] : [{ date, was, personId }]
		),
		unfilled: [...(repick?.unfilled ?? [])]
	};
}

/**
 * Puts the chosen person on the conflicted day and writes the later roster days it re-picks, all or none. The day is
 * a roster pick when the chosen person is the rule's pick and a hand assignment otherwise, as for someone off the
 * roster. The plan is recomputed
 * first, and a plan that no longer matches the preview, including who held each re-picked day, or that leaves a
 * later day with nobody, is refused.
 */
export async function commitRosterReplacement(
	ctx: RosterPlannerPorts,
	input: Record<string, unknown>
): Promise<{ saved: SavedAssignment[] }> {
	const parsed = rosterReplacementInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { replacing, repicks, ...request } = parsed.data;
	const { detail, selected, source, repick } = await planReplacement(ctx, request);
	const changes = repick?.changes ?? [];
	const same =
		detail.personId === replacing &&
		selected === request.assigneeId &&
		changes.length === repicks.length &&
		changes.every(
			(change, at) =>
				change.date === repicks[at].date && change.was === repicks[at].was && change.personId === repicks[at].personId
		);
	if (!same || !repick) fail(409, 'The roster changed since this preview. Review the new picks and try again.');
	if (repick.unfilled.length) fail(409, 'Nobody on the roster can take every re-picked day. Choose someone else.');

	const saved = await ctx.calendarAssignmentReplacement.writeRoster(ctx.auth.orgId, [
		{ date: request.date, assignmentTypeId: request.typeId, assigneeId: request.assigneeId, was: replacing, source },
		...slotChanges(repick)
	]);
	await ctx.audit.log({
		action: 'daily_assignment.roster_replaced',
		resourceType: 'daily_assignment',
		details: { assignmentTypeId: request.typeId, date: request.date, repicks: changes.length }
	});
	return { saved };
}
