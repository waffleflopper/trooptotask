import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { SpecialDay } from '$lib/types';

export const SpecialDayEntity = defineEntity<SpecialDay>({
	table: 'special_days',
	groupScope: 'none',
	orderBy: [{ column: 'date', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		date: field(z.string()),
		name: field(z.string()),
		type: field(z.enum(['federal-holiday', 'org-closure']))
	}
});
