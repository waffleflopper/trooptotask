import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCrudHandlers } from '$lib/server/crudFactory';
import type { PersonnelExtendedInfo } from '$lib/types/leadersBook';
import { getApiContext } from '$lib/server/supabase';
import { redactSensitiveFields } from '$lib/server/piiFilter';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	if (!orgId) throw error(400, 'Missing orgId');

	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	let canEdit = isSandbox;
	if (!isSandbox && userId) {
		const { data: membership } = await supabase
			.from('organization_memberships')
			.select('role, can_edit_personnel')
			.eq('organization_id', orgId)
			.eq('user_id', userId)
			.single();

		if (!membership) throw error(403, 'Not a member of this organization');
		canEdit = membership.role === 'owner' || membership.can_edit_personnel;
	}

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
};

const handlers = createCrudHandlers<PersonnelExtendedInfo>({
	table: 'personnel_extended_info',
	permission: 'personnel',
	auditResourceType: 'personnel_extended_info',
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
