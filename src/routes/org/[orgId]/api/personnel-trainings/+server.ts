import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { formatDate } from '$lib/utils/dates';
import { auditLog } from '$lib/server/auditLog';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';

function calculateExpirationDate(completionDate: string | null, expirationMonths: number | null): string | null {
	if (expirationMonths === null || !completionDate) return null;
	const date = new Date(completionDate);
	date.setMonth(date.getMonth() + expirationMonths);
	return formatDate(date);
}

export const POST = apiRoute({ permission: { edit: 'training' } }, async ({ supabase, orgId, userId, ctx }, event) => {
	const body = await event.request.json();

	if (body.personnelId) {
		await ctx.requireGroupAccess(supabase, body.personnelId);
	}

	// Fetch the training type to get expiration_months and expiration_date_only
	const { data: trainingType, error: typeError } = await supabase
		.from('training_types')
		.select('expiration_months, expiration_date_only')
		.eq('id', body.trainingTypeId)
		.eq('organization_id', orgId)
		.single();

	if (typeError) throw error(500, typeError.message);

	const isExpirationDateOnly = trainingType.expiration_date_only ?? false;
	const completionDate = body.completionDate || null;

	// Validation: expiration-date-only needs an expirationDate, normal expiring needs completionDate
	if (isExpirationDateOnly) {
		if (!body.expirationDate) {
			throw error(400, 'Expiration date is required for expiration-date-only training');
		}
	} else if (trainingType.expiration_months !== null && !completionDate) {
		throw error(400, 'Completion date is required for training that expires');
	}

	// For expiration-date-only, use the client-provided date; otherwise auto-calculate
	const expirationDate = isExpirationDateOnly
		? body.expirationDate
		: calculateExpirationDate(completionDate, trainingType.expiration_months);

	// Upsert: try to update existing, or insert new
	const { data: existing } = await supabase
		.from('personnel_trainings')
		.select('id')
		.eq('organization_id', orgId)
		.eq('personnel_id', body.personnelId)
		.eq('training_type_id', body.trainingTypeId)
		.single();

	let data;
	if (existing) {
		// Update existing
		const { data: updated, error: updateError } = await supabase
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
		const { data: inserted, error: insertError } = await supabase
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

	auditLog(
		{
			action: existing ? 'training_record.updated' : 'training_record.created',
			resourceType: 'training_record',
			resourceId: data.id,
			orgId,
			details: {
				actor: event.locals.user?.email ?? userId,
				personnel_id: data.personnel_id,
				training_type_id: data.training_type_id,
				completion_date: data.completion_date
			}
		},
		{ userId }
	);

	return json(PersonnelTrainingEntity.fromDb(data as Record<string, unknown>));
});

export const PUT = apiRoute({ permission: { edit: 'training' } }, async ({ supabase, orgId, userId, ctx }, event) => {
	const body = await event.request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

	// Fetch training type to determine how to handle expiration
	const { data: existing } = await supabase
		.from('personnel_trainings')
		.select('training_type_id, personnel_id')
		.eq('id', id)
		.single();

	if (existing?.personnel_id) {
		await ctx.requireGroupAccess(supabase, existing.personnel_id);
	}

	let isExpirationDateOnly = false;
	let expirationMonths: number | null = null;

	if (existing) {
		const { data: trainingType } = await supabase
			.from('training_types')
			.select('expiration_months, expiration_date_only')
			.eq('id', existing.training_type_id)
			.single();

		if (trainingType) {
			isExpirationDateOnly = trainingType.expiration_date_only ?? false;
			expirationMonths = trainingType.expiration_months;
		}
	}

	if (fields.completionDate !== undefined) {
		updates.completion_date = fields.completionDate;
	}

	if (isExpirationDateOnly) {
		// For expiration-date-only, use the client-provided expiration date directly
		if (fields.expirationDate !== undefined) {
			updates.expiration_date = fields.expirationDate;
		}
	} else if (fields.completionDate !== undefined) {
		// For normal trainings, recalculate expiration from completion date
		updates.expiration_date = calculateExpirationDate(fields.completionDate, expirationMonths);
	}

	if (fields.notes !== undefined) updates.notes = fields.notes;
	if (fields.certificateUrl !== undefined) updates.certificate_url = fields.certificateUrl;

	const { data, error: dbError } = await supabase
		.from('personnel_trainings')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'training_record.updated',
			resourceType: 'training_record',
			resourceId: id,
			orgId,
			details: {
				actor: event.locals.user?.email ?? userId,
				personnel_id: data.personnel_id,
				training_type_id: data.training_type_id,
				completion_date: data.completion_date
			}
		},
		{ userId }
	);

	return json(PersonnelTrainingEntity.fromDb(data as Record<string, unknown>));
});

export const DELETE = apiRoute(
	{ permission: { edit: 'training' } },
	async ({ supabase, orgId, userId, ctx }, event) => {
		const body = await event.request.json();
		const { id } = body;

		if (!id) throw error(400, 'Missing id');

		await ctx.requireGroupAccessByRecord(supabase, 'personnel_trainings', id, orgId, 'personnel_id');

		if (!ctx.isPrivileged && !ctx.isFullEditor) {
			return json({ requiresApproval: true }, { status: 202 });
		}

		const { error: dbError } = await supabase
			.from('personnel_trainings')
			.delete()
			.eq('id', id)
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		auditLog(
			{
				action: 'training_record.deleted',
				resourceType: 'training_record',
				resourceId: id,
				orgId,
				details: { actor: event.locals.user?.email ?? userId }
			},
			{ userId }
		);

		return json({ success: true });
	}
);
