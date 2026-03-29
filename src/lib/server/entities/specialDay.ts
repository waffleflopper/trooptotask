/**
 * Special day entity — maps `special_days` (federal holidays + org closures shown on calendar).
 * Supports only POST and DELETE (entries are replaced, not edited).
 * `type` is either `'federal-holiday'` or `'org-closure'`.
 * Federal holidays can be bulk-reset via `specialDayCrud.ts` `createResetFederalHolidaysUseCase`.
 */
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { SpecialDay } from '$lib/types';

export const SpecialDayEntity = defineEntity<SpecialDay>({
	table: 'special_days',
	permission: 'calendar',
	methods: ['POST', 'DELETE'],
	groupScope: 'none',
	audit: { resourceType: 'special_day' },
	orderBy: [{ column: 'date', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		date: field(z.string()),
		name: field(z.string()),
		type: field(z.enum(['federal-holiday', 'org-closure']))
	}
});
