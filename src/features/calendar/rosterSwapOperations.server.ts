import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { fail } from '$lib/errors';
import { dateOnlySchema, issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import type { CalendarRosterSwapPersistence, RosterSwapOptions, RosterSwapResult } from './contracts';
import { loadRosters } from './rosterFacts.server';
import { planningHorizon, requireOrganizationWide, requireWithinHorizon } from './rosterPlannerOperations.server';
import { requireDeviceDate, type RosterSettingsPorts } from './rosterSettingsOperations.server';
import { simulateRoster } from './roster/rosterEngine';
import { SWAP_ALREADY, SWAP_EMPTY, SWAP_PAST, SWAP_SAME_DAY, SWAP_SAME_PERSON } from './rosterSwapPersistence.server';

export interface RosterSwapPorts extends RosterSettingsPorts {
	calendarRosterSwaps: CalendarRosterSwapPersistence;
}
const previewInput = z.object({ typeId: uuidSchema, today: dateOnlySchema, date: dateOnlySchema }).strict();
const slotInput = z
	.object({ assignmentTypeId: uuidSchema, date: dateOnlySchema, was: z.union([uuidSchema, z.literal(''), z.null()]) })
	.strict();
const commitInput = z.object({ today: dateOnlySchema, days: z.tuple([slotInput, slotInput]) }).strict();
const undoInput = z.object({ today: dateOnlySchema, swapId: uuidSchema }).strict();

async function authorize(ctx: RosterSettingsPorts, today: string) {
	requireDeviceDate(today);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAssignments, { kind: 'unscoped' });
	requireOrganizationWide(ctx);
}

export async function previewRosterSwap(
	ctx: RosterSettingsPorts,
	input: Record<string, unknown>
): Promise<RosterSwapOptions> {
	const parsed = previewInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { typeId, today, date } = parsed.data;
	await authorize(ctx, today);
	if (date < today) fail(400, SWAP_PAST);
	requireWithinHorizon(date, today);
	const [facts] = await loadRosters(ctx, {
		today,
		window: { from: today, through: planningHorizon(today) },
		typeIds: [typeId]
	});
	if (!facts) fail(404, 'That duty roster is no longer available.');
	const swapped = new Set(facts.swaps.flatMap((swap) => swap.days.map((day) => day.date)));
	if (swapped.has(date)) fail(400, SWAP_ALREADY);
	const run = simulateRoster(facts);
	const detail = run.byDate.get(date)?.detail;
	if (detail?.kind !== 'stored') fail(400, SWAP_EMPTY);
	const warning = (personId: string, on: string) => {
		const effect = run.effectOn(personId, on);
		return effect.code === 'available' ? [] : [{ personId, date: on, code: effect.code, reason: effect.reason }];
	};
	return {
		date,
		personId: detail.personId,
		days: run.days.flatMap((day) => {
			const other = day.detail;
			if (day.date < today || swapped.has(day.date) || other?.kind !== 'stored' || other.personId === detail.personId)
				return [];
			return [
				{
					date: day.date,
					personId: other.personId,
					warnings: [...warning(detail.personId, day.date), ...warning(other.personId, date)]
				}
			];
		})
	};
}

export async function commitRosterSwap(
	ctx: RosterSwapPorts,
	input: Record<string, unknown>
): Promise<RosterSwapResult> {
	const parsed = commitInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const {
		today,
		days: [first, second]
	} = parsed.data;
	await authorize(ctx, today);
	if (first.assignmentTypeId !== second.assignmentTypeId) fail(400, 'Both days need to be on the same duty.');
	if (first.date === second.date) fail(400, SWAP_SAME_DAY);
	if (first.date < today || second.date < today) fail(400, SWAP_PAST);
	if (!first.was || !second.was) fail(400, SWAP_EMPTY);
	if (first.was === second.was) fail(400, SWAP_SAME_PERSON);
	const result = await ctx.calendarRosterSwaps.swap({
		assignmentTypeId: first.assignmentTypeId,
		today,
		days: [
			{ date: first.date, was: first.was },
			{ date: second.date, was: second.was }
		]
	});
	await ctx.audit.log({
		action: 'daily_assignment.roster_swapped',
		resourceType: 'daily_assignment',
		details: { assignmentTypeId: result.assignmentTypeId, dates: result.swap.days.map((day) => day.date) }
	});
	return result;
}

export async function undoRosterSwap(ctx: RosterSwapPorts, input: Record<string, unknown>): Promise<RosterSwapResult> {
	const parsed = undoInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { today, swapId } = parsed.data;
	await authorize(ctx, today);
	const result = await ctx.calendarRosterSwaps.undo({ today, swapId });
	await ctx.audit.log({
		action: 'daily_assignment.roster_swap_undone',
		resourceType: 'daily_assignment',
		details: { assignmentTypeId: result.assignmentTypeId, dates: result.swap.days.map((day) => day.date) }
	});
	return result;
}
