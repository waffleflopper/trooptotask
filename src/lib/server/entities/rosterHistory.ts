/**
 * Roster history entity — maps `duty_roster_history` (duty roster generation log).
 * Read-only via the `rosterHistoryQuery.ts` use case; rows are written by the
 * duty-roster generator, not through this entity's CRUD route.
 * `roster` and `config` are JSONB columns stored as `z.any()`.
 */
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';

export const RosterHistoryEntity = defineEntity<RosterHistoryItem>({
	table: 'duty_roster_history',
	groupScope: 'none',
	orderBy: [{ column: 'created_at', ascending: false }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		assignmentTypeId: field(z.string(), { column: 'assignment_type_id' }),
		name: field(z.string()),
		startDate: field(z.string(), { column: 'start_date' }),
		endDate: field(z.string(), { column: 'end_date' }),
		roster: field(z.any(), { nullDefault: [] }),
		config: field(z.any(), { nullDefault: {} }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true })
	}
});
