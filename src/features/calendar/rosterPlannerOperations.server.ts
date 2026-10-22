import { error } from '@sveltejs/kit';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';
import { toDayNumber } from '$lib/utils/dayNumber';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import { plannerRostersInput, rosterFillInput, rosterFillPreviewInput } from './calendarPersistenceMapping.server';
import type { CalendarAssignmentReplacementPort, PlannerRoster, RosterFillPreview, SavedAssignment } from './contracts';
import { requireDeviceDate, type RosterSettingsPorts } from './rosterSettingsOperations.server';
import { loadRosters } from './rosterFacts.server';
import {
	detailConflicts,
	simulateRoster,
	slotChanges,
	type CurrentCount,
	type Effect,
	type RosterRun
} from './roster/rosterEngine';

export interface RosterPlannerPorts extends RosterSettingsPorts {
	calendarAssignmentReplacement: Pick<CalendarAssignmentReplacementPort, 'fillRoster'>;
}

const action = CALENDAR_POLICY_ACTIONS.manageAssignments;
const resource = { kind: 'unscoped' } as const;
const MAX_FILL_DAYS = 366;

/** A roster counts everyone in the Organization, so its counts and picks are for Organization-wide operators only. */
function requireOrganizationWide(ctx: RosterSettingsPorts) {
	if (!ctx.auth.isPrivileged && ctx.auth.scopeSet.kind !== 'organization') {
		fail(403, 'Duty roster counts need Organization-wide Calendar access.');
	}
}

/** Every live roster's counts today, its standings on each detail day of `month`, and the month's A, D and U days. */
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

	const first = `${month}-01`;
	const last = endOfMonth(month);
	const window = { from: first < today ? first : today, through: last > today ? last : today };
	const rosters = await loadRosters(ctx, { today, window });
	return rosters.map((facts) => plannerRoster(simulateRoster(facts), first, last));
}

function plannerRoster(run: RosterRun, first: string, last: string): PlannerRoster {
	const { facts } = run;
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
	const inMonth = (date: string) => date >= first && date <= last;

	return {
		typeId: facts.type.id,
		people,
		effects,
		current: run.current?.map(({ track, counts }) => ({ track, standing: flat(counts) })) ?? null,
		todayAssignee: run.byDate.get(facts.today)?.detail?.personId ?? null,
		days: run.days
			.filter((day) => inMonth(day.date))
			.map((day) => ({ date: day.date, track: day.track, standing: flat(day.standing) })),
		excused: facts.excusals
			.filter((excusal) => excusal.from <= facts.today && (excusal.through === null || excusal.through >= facts.today))
			.map((excusal) => excusal.personId),
		conflicts: detailConflicts(run).flatMap((day) => {
			const detail = day.detail;
			if (!inMonth(day.date) || detail?.kind !== 'stored' || detail.effect.code === 'available') return [];
			return [{ date: day.date, personId: detail.personId, code: detail.effect.code, reason: detail.effect.reason }];
		})
	};
}

function endOfMonth(month: string): string {
	const [year, value] = month.split('-').map(Number);
	return `${month}-${String(new Date(Date.UTC(year, value, 0)).getUTCDate()).padStart(2, '0')}`;
}

async function planFill(
	ctx: RosterSettingsPorts,
	input: { typeId: string; today: string; from: string; through: string }
) {
	const { typeId, today, from, through } = input;
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, action, resource);
	requireOrganizationWide(ctx);
	if (from < today) fail(400, 'Fill from today or a later day.');
	if (through < from) fail(400, 'The last day comes before the first.');
	if (toDayNumber(through) - toDayNumber(from) >= MAX_FILL_DAYS)
		fail(400, `Fill at most ${MAX_FILL_DAYS} days at once.`);

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

	const saved = await ctx.calendarAssignmentReplacement.fillRoster(ctx.auth.orgId, slotChanges(run));
	await ctx.audit.log({
		action: 'daily_assignment.roster_filled',
		resourceType: 'daily_assignment',
		details: { assignmentTypeId: plan.typeId, from: plan.from, through: plan.through, days: saved.length }
	});
	return { saved };
}
