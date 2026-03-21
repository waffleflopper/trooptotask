import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { Personnel } from '$lib/types';

export const PersonnelEntity = defineEntity<Personnel>({
	table: 'personnel',
	groupScope: 'none',
	select: '*, groups(name)',
	schema: {
		id: field(z.string(), { readOnly: true }),
		rank: field(z.string()),
		lastName: field(z.string(), { column: 'last_name' }),
		firstName: field(z.string(), { column: 'first_name' }),
		mos: field(z.string().optional(), { insertDefault: '' }),
		clinicRole: field(z.string(), { column: 'clinic_role' }),
		groupId: field(z.string().nullable().optional(), { column: 'group_id', insertDefault: null }),
		archivedAt: field(z.string().nullable().optional(), { column: 'archived_at', readOnly: true })
	},
	customTransform: (row: Record<string, unknown>) => ({
		id: row.id as string,
		rank: row.rank as string,
		lastName: row.last_name as string,
		firstName: row.first_name as string,
		mos: (row.mos as string) ?? '',
		clinicRole: row.clinic_role as string,
		groupId: row.group_id as string,
		groupName: ((row.groups as Record<string, unknown>)?.name as string) ?? '',
		archivedAt: (row.archived_at as string) ?? null
	})
});
