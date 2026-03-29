/**
 * Pinned groups entity — maps `user_pinned_groups` (per-user sidebar group pins).
 * `customTransform` flattens rows to just the `group_name` string — the store only
 * needs the names, not the full row. Writes go through `pinnedGroupCrud.ts` use case
 * rather than generic CRUD because sandbox users are silently no-opped.
 */
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';

export const PinnedGroupsEntity = defineEntity<string>({
	table: 'user_pinned_groups',
	groupScope: 'none',
	orderBy: [{ column: 'sort_order', ascending: true }],
	customTransform: (row: Record<string, unknown>) => row.group_name as string,
	schema: {
		id: field(z.string(), { readOnly: true }),
		groupName: field(z.string(), { column: 'group_name' }),
		userId: field(z.string(), { column: 'user_id' }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 })
	}
});
