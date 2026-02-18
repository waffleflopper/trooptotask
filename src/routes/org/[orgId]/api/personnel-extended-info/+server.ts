import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();

	const { data, error: dbError } = await supabase
		.from('personnel_extended_info')
		.insert({
			organization_id: orgId,
			personnel_id: body.personnelId,
			emergency_contact_name: body.emergencyContactName ?? null,
			emergency_contact_relationship: body.emergencyContactRelationship ?? null,
			emergency_contact_phone: body.emergencyContactPhone ?? null,
			spouse_name: body.spouseName ?? null,
			spouse_phone: body.spousePhone ?? null,
			vehicle_make_model: body.vehicleMakeModel ?? null,
			vehicle_plate: body.vehiclePlate ?? null,
			vehicle_color: body.vehicleColor ?? null,
			personal_email: body.personalEmail ?? null,
			personal_phone: body.personalPhone ?? null,
			address_street: body.addressStreet ?? null,
			address_city: body.addressCity ?? null,
			address_state: body.addressState ?? null,
			address_zip: body.addressZip ?? null,
			leader_notes: body.leaderNotes ?? null
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		emergencyContactName: data.emergency_contact_name,
		emergencyContactRelationship: data.emergency_contact_relationship,
		emergencyContactPhone: data.emergency_contact_phone,
		spouseName: data.spouse_name,
		spousePhone: data.spouse_phone,
		vehicleMakeModel: data.vehicle_make_model,
		vehiclePlate: data.vehicle_plate,
		vehicleColor: data.vehicle_color,
		personalEmail: data.personal_email,
		personalPhone: data.personal_phone,
		addressStreet: data.address_street,
		addressCity: data.address_city,
		addressState: data.address_state,
		addressZip: data.address_zip,
		leaderNotes: data.leader_notes
	});
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.emergencyContactName !== undefined)
		updates.emergency_contact_name = fields.emergencyContactName;
	if (fields.emergencyContactRelationship !== undefined)
		updates.emergency_contact_relationship = fields.emergencyContactRelationship;
	if (fields.emergencyContactPhone !== undefined)
		updates.emergency_contact_phone = fields.emergencyContactPhone;
	if (fields.spouseName !== undefined) updates.spouse_name = fields.spouseName;
	if (fields.spousePhone !== undefined) updates.spouse_phone = fields.spousePhone;
	if (fields.vehicleMakeModel !== undefined) updates.vehicle_make_model = fields.vehicleMakeModel;
	if (fields.vehiclePlate !== undefined) updates.vehicle_plate = fields.vehiclePlate;
	if (fields.vehicleColor !== undefined) updates.vehicle_color = fields.vehicleColor;
	if (fields.personalEmail !== undefined) updates.personal_email = fields.personalEmail;
	if (fields.personalPhone !== undefined) updates.personal_phone = fields.personalPhone;
	if (fields.addressStreet !== undefined) updates.address_street = fields.addressStreet;
	if (fields.addressCity !== undefined) updates.address_city = fields.addressCity;
	if (fields.addressState !== undefined) updates.address_state = fields.addressState;
	if (fields.addressZip !== undefined) updates.address_zip = fields.addressZip;
	if (fields.leaderNotes !== undefined) updates.leader_notes = fields.leaderNotes;

	const { data, error: dbError } = await supabase
		.from('personnel_extended_info')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		emergencyContactName: data.emergency_contact_name,
		emergencyContactRelationship: data.emergency_contact_relationship,
		emergencyContactPhone: data.emergency_contact_phone,
		spouseName: data.spouse_name,
		spousePhone: data.spouse_phone,
		vehicleMakeModel: data.vehicle_make_model,
		vehiclePlate: data.vehicle_plate,
		vehicleColor: data.vehicle_color,
		personalEmail: data.personal_email,
		personalPhone: data.personal_phone,
		addressStreet: data.address_street,
		addressCity: data.address_city,
		addressState: data.address_state,
		addressZip: data.address_zip,
		leaderNotes: data.leader_notes
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await supabase
		.from('personnel_extended_info')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
