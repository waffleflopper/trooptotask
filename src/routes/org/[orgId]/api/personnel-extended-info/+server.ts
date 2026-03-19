import { json, error } from '@sveltejs/kit';
import { createCrudHandlers } from '$lib/server/crudFactory';
import { apiRoute } from '$lib/server/apiRoute';
import type { PersonnelExtendedInfo } from '$features/counseling/counseling.types';
import { redactSensitiveFields } from '$lib/server/piiFilter';

export const GET = apiRoute(
	{ permission: { authenticated: true }, readOnly: false },
	async ({ supabase, orgId, ctx }) => {
		const canEdit = ctx.isPrivileged || ctx.canEdit.personnel || ctx.canEdit['leaders-book'];

		const { data, error: dbError } = await supabase
			.from('personnel_extended_info')
			.select('*')
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		const rows = data ?? [];
		if (canEdit) {
			return json(rows);
		}

		return json(rows.map(redactSensitiveFields));
	}
);

const handlers = createCrudHandlers<PersonnelExtendedInfo>({
	table: 'personnel_extended_info',
	permission: 'leaders-book',
	personnelIdField: 'personnel_id',
	auditResourceType: 'personnel_extended_info',
	auditDetailFields: ['personnel_id'],
	fields: {
		personnelId: 'personnel_id',
		emergencyContactName: 'emergency_contact_name',
		emergencyContactRelationship: 'emergency_contact_relationship',
		emergencyContactPhone: 'emergency_contact_phone',
		spouseName: 'spouse_name',
		spousePhone: 'spouse_phone',
		vehicleMakeModel: 'vehicle_make_model',
		vehiclePlate: 'vehicle_plate',
		vehicleColor: 'vehicle_color',
		personalEmail: 'personal_email',
		personalPhone: 'personal_phone',
		addressStreet: 'address_street',
		addressCity: 'address_city',
		addressState: 'address_state',
		addressZip: 'address_zip',
		leaderNotes: 'leader_notes'
	},
	defaults: {
		emergency_contact_name: null,
		emergency_contact_relationship: null,
		emergency_contact_phone: null,
		spouse_name: null,
		spouse_phone: null,
		vehicle_make_model: null,
		vehicle_plate: null,
		vehicle_color: null,
		personal_email: null,
		personal_phone: null,
		address_street: null,
		address_city: null,
		address_state: null,
		address_zip: null,
		leader_notes: null
	}
});

export const { POST, PUT, DELETE } = handlers;
