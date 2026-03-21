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
