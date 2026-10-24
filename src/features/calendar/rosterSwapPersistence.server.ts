import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fail } from '$lib/errors';
import { DEVICE_DATE_MESSAGE } from './calendarCatalogPersistence.server';
import { rosterSwapRowSchema, toAssignment, toRosterSwap } from './calendarPersistenceMapping.server';
import type { CalendarRosterSwapPersistence } from './contracts';

export const SWAP_ROSTER_CHANGED = 'The roster changed since this preview. Review the days and try again.';
export const SWAP_PAST = 'Swap only today or later days.';
export const SWAP_SAME_DAY = 'Choose two different days.';
export const SWAP_EMPTY = 'Both days need an assigned person.';
export const SWAP_SAME_PERSON = 'Choose days held by two different people.';
export const SWAP_PERSON_DUTY = 'Both days need a person-assigned duty.';
export const SWAP_ALREADY = 'One of these days is already in a swap. Undo it first.';
export const SWAP_UNDO_PAST = 'A swap cannot be undone after either day has passed.';

const resultSchema = z.object({
	swap: rosterSwapRowSchema,
	saved: z
		.array(
			z.object({
				id: z.string(),
				date: z.string(),
				assignment_type_id: z.string(),
				assignee_id: z.string(),
				organization_id: z.string(),
				created_at: z.string()
			})
		)
		.length(2)
});

export function createSupabaseRosterSwapPersistence(
	client: SupabaseClient,
	orgId: string
): CalendarRosterSwapPersistence {
	async function command(name: string, args: Record<string, unknown>, undo = false) {
		const { data, error } = await client.rpc(name, { p_organization_id: orgId, ...args });
		if (error) {
			switch (error.code) {
				case '42501':
					return fail(403, 'Duty swaps need Organization-wide Calendar operation access.');
				case 'RSD01':
					return fail(400, DEVICE_DATE_MESSAGE);
				case 'RSW01':
					return fail(409, SWAP_ROSTER_CHANGED);
				case 'RSW02':
					return fail(400, undo ? SWAP_UNDO_PAST : SWAP_PAST);
				case 'RSW03':
					return fail(400, SWAP_SAME_DAY);
				case 'RSW04':
					return fail(400, SWAP_EMPTY);
				case 'RSW05':
					return fail(400, SWAP_SAME_PERSON);
				case 'RSW06':
					return fail(400, SWAP_PERSON_DUTY);
				case 'RSW07':
					return fail(400, SWAP_ALREADY);
				default:
					throw new Error(error.message);
			}
		}
		const result = resultSchema.parse(data);
		return {
			swap: toRosterSwap(result.swap),
			assignmentTypeId: result.swap.assignment_type_id,
			saved: result.saved.map(toAssignment)
		};
	}
	return {
		swap: ({ assignmentTypeId, today, days: [first, second] }) =>
			command('swap_roster_days', {
				p_assignment_type_id: assignmentTypeId,
				p_today: today,
				p_first_date: first.date,
				p_first_was: first.was,
				p_second_date: second.date,
				p_second_was: second.was
			}),
		undo: ({ today, swapId }) => command('undo_roster_swap', { p_today: today, p_swap_id: swapId }, true)
	};
}
