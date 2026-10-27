import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { CalendarDateRange } from '../contracts';
import type { CalendarTaskingWorkspaceReader } from '../taskings/taskingRead.server';
import {
	calendarProjectionSchema,
	calendarTaskingFacts,
	EMPTY_PROJECTION,
	EMPTY_TASKING_FACTS,
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
			const [projection, hosts] = await Promise.all([
				client.rpc('calendar_range_projection', {
					p_organization_id: orgId,
					p_range_start: rangeStart,
					p_range_end: rangeEnd
				}),
				client
					.from('calendar_events')
					.select('id, host_name')
					.eq('organization_id', orgId)
					.lte('starts_on', rangeEnd)
					.gte('ends_on', rangeStart)
			]);
			if (projection.error) throw new Error(projection.error.message);
			if (hosts.error) throw new Error(hosts.error.message);
			const hostById = new Map(hosts.data.map((row) => [row.id, row.host_name]));
			const data = projection.data as { events?: { id: string }[] } | null;
			return calendarProjectionSchema.parse({
				...data,
				events: data?.events?.map((event) => ({ ...event, host: hostById.get(event.id) ?? null }))
			});
		}
	};
}

/**
 * The Events, suspenses and commitments for one range, with the Tasking facts the Calendar's cards read. With the
 * switch off nothing is read. A failed read is reported as `failed` rather than thrown, so the region that shows it
 * can fail without taking its siblings down.
 */
export async function readCalendarProjection(
	ctx: {
		calendarProjection: CalendarProjectionReader;
		taskingWorkspace: CalendarTaskingWorkspaceReader;
		disabledFeatures: readonly FeatureKey[];
	},
	range: CalendarDateRange,
	today: string
): Promise<CalendarProjectionRead> {
	if (ctx.disabledFeatures.includes('eventsAndTaskings')) {
		return { kind: 'loaded', ...EMPTY_PROJECTION, facts: EMPTY_TASKING_FACTS };
	}
	try {
		const [projection, workspace] = await Promise.all([
			ctx.calendarProjection.read(range),
			ctx.taskingWorkspace.read(today)
		]);
		return { kind: 'loaded', ...projection, facts: calendarTaskingFacts(projection, workspace, today) };
	} catch (error) {
		console.error('[calendar-projection]', error);
		return { kind: 'failed' };
	}
}
