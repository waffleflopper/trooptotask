import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';

function calculateExpirationDate(completionDate: string | null, expirationMonths: number | null): string | null {
	if (expirationMonths === null || !completionDate) return null;
	const date = new Date(completionDate);
	date.setMonth(date.getMonth() + expirationMonths);
	return date.toISOString().split('T')[0];
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'training');

	const body = await request.json();

	// Fetch the training type to get expiration_months
	const { data: trainingType, error: typeError } = await locals.supabase
		.from('training_types')
		.select('expiration_months')
		.eq('id', body.trainingTypeId)
		.eq('organization_id', orgId)
		.single();

	if (typeError) throw error(500, typeError.message);

	// For never-expires training, completion date is optional
	// For expiring training, completion date is required
	const completionDate = body.completionDate || null;
	if (trainingType.expiration_months !== null && !completionDate) {
		throw error(400, 'Completion date is required for training that expires');
	}

	const expirationDate = calculateExpirationDate(completionDate, trainingType.expiration_months);

	// Upsert: try to update existing, or insert new
	const { data: existing } = await locals.supabase
		.from('personnel_trainings')
		.select('id')
		.eq('organization_id', orgId)
		.eq('personnel_id', body.personnelId)
		.eq('training_type_id', body.trainingTypeId)
		.single();

	let data;
	if (existing) {
		// Update existing
		const { data: updated, error: updateError } = await locals.supabase
			.from('personnel_trainings')
			.update({
				completion_date: completionDate,
				expiration_date: expirationDate,
				notes: body.notes ?? null,
				certificate_url: body.certificateUrl ?? null,
				updated_at: new Date().toISOString()
			})
			.eq('id', existing.id)
			.select()
			.single();

		if (updateError) throw error(500, updateError.message);
		data = updated;
	} else {
		// Insert new
		const { data: inserted, error: insertError } = await locals.supabase
			.from('personnel_trainings')
			.insert({
				organization_id: orgId,
				personnel_id: body.personnelId,
				training_type_id: body.trainingTypeId,
				completion_date: completionDate,
				expiration_date: expirationDate,
				notes: body.notes ?? null,
				certificate_url: body.certificateUrl ?? null
			})
			.select()
			.single();

		if (insertError) throw error(500, insertError.message);
		data = inserted;
	}

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		trainingTypeId: data.training_type_id,
		completionDate: data.completion_date,
		expirationDate: data.expiration_date,
		notes: data.notes,
		certificateUrl: data.certificate_url
	});
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'training');

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

	// If completion_date is being updated, recalculate expiration_date
	if (fields.completionDate !== undefined) {
		updates.completion_date = fields.completionDate;

		// Fetch training type to get expiration_months
		const { data: existing } = await locals.supabase
			.from('personnel_trainings')
			.select('training_type_id')
			.eq('id', id)
			.single();

		if (existing) {
			const { data: trainingType } = await locals.supabase
				.from('training_types')
				.select('expiration_months')
				.eq('id', existing.training_type_id)
				.single();

			if (trainingType) {
				updates.expiration_date = calculateExpirationDate(fields.completionDate, trainingType.expiration_months);
			}
		}
	}

	if (fields.notes !== undefined) updates.notes = fields.notes;
	if (fields.certificateUrl !== undefined) updates.certificate_url = fields.certificateUrl;

	const { data, error: dbError } = await locals.supabase
		.from('personnel_trainings')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		trainingTypeId: data.training_type_id,
		completionDate: data.completion_date,
		expirationDate: data.expiration_date,
		notes: data.notes,
		certificateUrl: data.certificate_url
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'training');

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await locals.supabase
		.from('personnel_trainings')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
