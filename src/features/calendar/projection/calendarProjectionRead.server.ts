import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { CalendarDateRange } from '../contracts';
import {
	calendarProjectionSchema,
	EMPTY_PROJECTION,
	type CalendarProjection,
	type CalendarProjectionRead
} from './calendarProjection';

export interface CalendarProjectionReader {
	/** Runs as the signed-in reader, so the database applies the read policy to every row. */
	read(range: CalendarDateRange): Promise<CalendarProjection>;
}

export function createSupabaseCalendarProjectionReader(
	client: SupabaseClient,
	orgId: string
): CalendarProjectionReader {
	return {
		async read({ rangeStart, rangeEnd }) {
			const { data, error } = await client.rpc('calendar_range_projection', {
				p_organization_id: orgId,
				p_range_start: rangeStart,
				p_range_end: rangeEnd
			});
			if (error) throw new Error(error.message);
			return calendarProjectionSchema.parse(data);
		}
	};
}

/**
 * The Events, suspenses and commitments for one range. With the switch off nothing is read. A failed read is
 * reported as `failed` rather than thrown, so the region that shows it can fail without taking its siblings down.
 */
export async function readCalendarProjection(
	ctx: { calendarProjection: CalendarProjectionReader; disabledFeatures: readonly FeatureKey[] },
	range: CalendarDateRange
): Promise<CalendarProjectionRead> {
	if (ctx.disabledFeatures.includes('eventsAndTaskings')) return { kind: 'loaded', ...EMPTY_PROJECTION };
	try {
		return { kind: 'loaded', ...(await ctx.calendarProjection.read(range)) };
	} catch (error) {
		console.error('[calendar-projection]', error);
		return { kind: 'failed' };
	}
}
