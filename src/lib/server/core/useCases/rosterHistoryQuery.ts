import type { UseCaseContext } from '$lib/server/core/ports';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
import { RosterHistoryEntity } from '$lib/server/entities/rosterHistory';

export async function fetchRosterHistory(ctx: UseCaseContext): Promise<RosterHistoryItem[]> {
	ctx.auth.requireView('calendar');

	const orgId = ctx.auth.orgId;

	const rows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_roster_history',
		orgId,
		undefined,
		{
			orderBy: [{ column: 'created_at', ascending: false }],
			limit: 50
		}
	);

	return RosterHistoryEntity.fromDbArray(rows);
}
