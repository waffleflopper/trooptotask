/**
 * Special day entity — maps `special_days` (federal holidays + org closures shown on calendar).
 * Supports create, inline edit, and delete operations.
 * `type` is either `'federal-holiday'` or `'org-closure'`.
 * Federal holidays can be bulk-reset via `specialDayCrud.ts` `createResetFederalHolidaysUseCase`.
 */
import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { SpecialDay } from '$lib/types';

export const SpecialDayEntity = defineEntity<SpecialDay>({
	table: 'special_days',
	permission: 'calendar',
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	methods: ['POST', 'PUT', 'DELETE'],
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
