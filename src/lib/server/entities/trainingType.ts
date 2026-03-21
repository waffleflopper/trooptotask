import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import { notifyAdmins } from '$lib/server/notifications';
import type { TrainingType } from '$features/training/training.types';

export const TrainingTypeEntity = defineEntity<TrainingType>({
	table: 'training_types',
	permission: 'training',
	requireFullEditor: true,
	groupScope: 'none',
	audit: { resourceType: 'training_type', detailFields: ['name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	onDelete: async (supabase, orgId, id) => {
		await supabase.from('personnel_trainings').delete().eq('training_type_id', id).eq('organization_id', orgId);
	},
	onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
		await notifyAdmins(orgId, userId, {
			type: 'config_type_deleted',
			title: 'Training Type Deleted',
			message: `"${userEmail}" deleted the training type "${deletedDetails?.name ?? 'unknown'}".`
		});
	},
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		description: field(z.string().nullable(), { insertDefault: null }),
		expirationMonths: field(z.number().int().nullable(), {
			column: 'expiration_months',
			insertDefault: null
		}),
		warningDaysYellow: field(z.number().int(), {
			column: 'warning_days_yellow',
			insertDefault: 60
		}),
		warningDaysOrange: field(z.number().int(), {
			column: 'warning_days_orange',
			insertDefault: 30
		}),
		requiredForRoles: field(z.array(z.string()), {
			column: 'required_for_roles',
			insertDefault: [],
			nullDefault: []
		}),
		color: field(z.string(), { insertDefault: '#6b7280' }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 }),
		expirationDateOnly: field(z.boolean(), {
			column: 'expiration_date_only',
			insertDefault: false,
			nullDefault: false
		}),
		canBeExempted: field(z.boolean(), {
			column: 'can_be_exempted',
			insertDefault: false,
			nullDefault: false
		}),
		exemptPersonnelIds: field(z.array(z.string()), {
			column: 'exempt_personnel_ids',
			insertDefault: [],
			nullDefault: []
		})
	}
});
