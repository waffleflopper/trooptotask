import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { auditLog } from '$lib/server/auditLog';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import { buildContext, postHandler } from '$lib/server/adapters/httpAdapter';
import { validateUUID } from '$lib/server/validation';
import {
	createTrainingRecord,
	deleteTrainingRecord,
	calculateExpirationDate
} from '$lib/server/core/useCases/trainingRecords';

export const POST = postHandler(createTrainingRecord);

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

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	const id = body.id;
	if (!id || typeof id !== 'string') throw error(400, 'Missing id');
	if (!validateUUID(id)) throw error(400, 'Invalid resource ID');

	try {
		const result = await deleteTrainingRecord(ctx, id);
		if (result?.requiresApproval) {
			return json({ requiresApproval: true }, { status: 202 });
		}
		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};
