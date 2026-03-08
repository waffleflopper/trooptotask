import { createCrudHandlers } from '$lib/server/crudFactory';
import type { TrainingType } from '$lib/types';

const handlers = createCrudHandlers<TrainingType>({
	table: 'training_types',
	permission: 'training',
	requireFullEditor: true,
	fields: {
		expirationMonths: 'expiration_months',
		warningDaysYellow: 'warning_days_yellow',
		warningDaysOrange: 'warning_days_orange',
		requiredForRoles: 'required_for_roles',
		sortOrder: 'sort_order',
		expirationDateOnly: 'expiration_date_only',
		canBeExempted: 'can_be_exempted',
		exemptPersonnelIds: 'exempt_personnel_ids'
	},
	defaults: {
		expiration_months: null,
		warning_days_yellow: 60,
		warning_days_orange: 30,
		required_for_roles: [],
		color: '#6b7280',
		sort_order: 0,
		expiration_date_only: false,
		can_be_exempted: false,
		exempt_personnel_ids: []
	},
	auditResourceType: 'training_type',
	auditDetailFields: ['name'],
	// Cascade delete: remove personnel trainings with this type
	onDelete: async (supabase, orgId, id) => {
		await supabase
			.from('personnel_trainings')
			.delete()
			.eq('training_type_id', id)
			.eq('organization_id', orgId);
	}
});

export const { POST, PUT, DELETE } = handlers;
