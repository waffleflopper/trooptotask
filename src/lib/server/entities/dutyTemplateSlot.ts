import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { DutyTemplateSlot } from '$features/duty-roster/duty-roster.types';

export const DutyTemplateSlotEntity = defineEntity<DutyTemplateSlot>({
	table: 'duty_template_slots',
	groupScope: 'none',
	schema: {
		id: field(z.string(), { readOnly: true }),
		templateId: field(z.string(), { column: 'template_id' }),
		roleLabel: field(z.string().min(1).max(80), { column: 'role_label' }),
		quantity: field(z.number().int().min(1), { insertDefault: 1 }),
		allowedRanks: field(z.array(z.string()), {
			column: 'allowed_ranks',
			insertDefault: [],
			nullDefault: []
		}),
		allowedGroupIds: field(z.array(z.string()), {
			column: 'allowed_group_ids',
			insertDefault: [],
			nullDefault: []
		}),
		preferredGroupIds: field(z.array(z.string()), {
			column: 'preferred_group_ids',
			insertDefault: [],
			nullDefault: []
		}),
		allowedMosValues: field(z.array(z.string()), {
			column: 'allowed_mos_values',
			insertDefault: [],
			nullDefault: []
		}),
		allowedRoleValues: field(z.array(z.string()), {
			column: 'allowed_role_values',
			insertDefault: [],
			nullDefault: []
		}),
		rotationPoolKey: field(z.string().min(1).max(120), {
			column: 'rotation_pool_key',
			insertDefault: 'default'
		}),
		sortOrder: field(z.number().int().min(0), { column: 'sort_order', insertDefault: 0 })
	}
});
