import { json } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import {
	createTrainingRecord,
	deleteTrainingRecord,
	calculateExpirationDate
} from '$lib/server/core/useCases/trainingRecords';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'training',
	mutation: true,
	fn: (ctx, input) => createTrainingRecord(ctx, input)
});

export const PUT = handle<Record<string, unknown>, unknown>({
	permission: 'training',
	mutation: true,
	fn: async (ctx, input) => {
		const { id, ...fields } = input;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		const existing = await ctx.store.findOne<{
			training_type_id: string;
			personnel_id: string;
		}>('personnel_trainings', ctx.auth.orgId, { id });

		if (existing?.personnel_id) {
			await ctx.auth.requireGroupAccess(existing.personnel_id);
		}

		let isExpirationDateOnly = false;
		let expirationMonths: number | null = null;

		if (existing) {
			const trainingType = await ctx.store.findOne<{
				expiration_months: number | null;
				expiration_date_only: boolean | null;
			}>('training_types', ctx.auth.orgId, { id: existing.training_type_id });

			if (trainingType) {
				isExpirationDateOnly = trainingType.expiration_date_only ?? false;
				expirationMonths = trainingType.expiration_months;
			}
		}

		const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

		if (fields.completionDate !== undefined) {
			updates.completion_date = fields.completionDate;
		}

		if (isExpirationDateOnly) {
			if (fields.expirationDate !== undefined) {
				updates.expiration_date = fields.expirationDate;
			}
		} else if (fields.completionDate !== undefined) {
			updates.expiration_date = calculateExpirationDate(fields.completionDate as string, expirationMonths);
		}

		if (fields.notes !== undefined) updates.notes = fields.notes;
		if (fields.certificateUrl !== undefined) updates.certificate_url = fields.certificateUrl;

		const row = await ctx.store.update<Record<string, unknown>>(
			'personnel_trainings',
			ctx.auth.orgId,
			id as string,
			updates
		);

		ctx.audit.log({
			action: 'training_record.updated',
			resourceType: 'training_record',
			resourceId: id as string,
			details: {
				personnel_id: row.personnel_id,
				training_type_id: row.training_type_id,
				completion_date: row.completion_date
			}
		});

		return PersonnelTrainingEntity.fromDb(row);
	}
});

export const DELETE = handle<Record<string, unknown>, Record<string, unknown>>({
	permission: 'training',
	mutation: true,
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');

		const result = await deleteTrainingRecord(ctx, id);
		if (result?.requiresApproval) {
			return { requiresApproval: true };
		}
		return { success: true };
	},
	formatOutput: (result) => {
		if (result.requiresApproval) {
			return json(result, { status: 202 });
		}
		return json(result);
	}
});
