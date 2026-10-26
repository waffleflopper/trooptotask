import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { uuidSchema } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '../../calendarPolicy.server';
import { TASKING_GONE } from '../taskingPersistence.server';
import type { AvailabilityCoverage } from './staffingModel';

export interface CalendarAvailabilityGapsPersistence {
	/** Of the picked People the reader may set Availability for, how many leave an execution day uncovered. */
	listGaps(taskingId: string): Promise<AvailabilityCoverage>;
}

export interface CalendarAvailabilityGapsPorts {
	auth: OrganizationAccessGrant;
	calendarAvailabilityGaps: CalendarAvailabilityGapsPersistence;
}

const gapRowSchema = z.object({ personnel_id: z.string(), covered: z.boolean() });

export function createSupabaseCalendarAvailabilityGaps(
	client: SupabaseClient,
	orgId: string
): CalendarAvailabilityGapsPersistence {
	return {
		async listGaps(taskingId) {
			const { data, error } = await selectAllSupabaseRows<unknown>(
				async (from, to) =>
					await client
						.rpc('calendar_tasking_availability_gaps', { p_organization_id: orgId, p_tasking_id: taskingId })
						.range(from, to)
			);
			if (error) throw new Error((error as { message: string }).message);
			const rows = (data ?? []).map((row) => gapRowSchema.parse(row));
			return { checked: rows.length, uncovered: rows.filter((row) => !row.covered).length };
		}
	};
}

export async function loadTaskingAvailabilityGaps(
	ctx: CalendarAvailabilityGapsPorts,
	id: string
): Promise<AvailabilityCoverage> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	if (!uuidSchema.safeParse(id).success) fail(404, TASKING_GONE);
	return ctx.calendarAvailabilityGaps.listGaps(id);
}
