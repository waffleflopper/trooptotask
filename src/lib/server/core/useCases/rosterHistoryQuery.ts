/**
 * Roster history query — fetches the log of past duty roster generation runs.
 *
 * Returns all `duty_roster_history` rows for the org, sorted newest-first. Used by
 * the duty roster page to show a "recently generated" history list.
 *
 * History rows are created by the duty-roster generator; this use case is read-only.
 */
import type { QueryPorts } from '$lib/server/core/ports';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
import { RosterHistoryEntity } from '$lib/server/entities/rosterHistory';

export async function fetchRosterHistory(ctx: QueryPorts): Promise<RosterHistoryItem[]> {
	ctx.auth.requireView('calendar');

	const orgId = ctx.auth.orgId;

	const rows = await ctx.store.findMany<Record<string, unknown>>('duty_roster_history', orgId, undefined, {
		orderBy: [{ column: 'created_at', ascending: false }],
		limit: 50
	});

	return RosterHistoryEntity.fromDbArray(rows);
}
