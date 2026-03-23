import { formatDate, parseDate } from '$lib/utils/dates';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import type { UseCaseContext } from '$lib/server/core/ports';

function fail(status: number, message: string): never {
	const err = new Error(message);
	(err as unknown as Record<string, unknown>).status = status;
	throw err;
}

const entity = PersonnelTrainingEntity;
const AUDIT_RESOURCE = 'training_record';

export function calculateExpirationDate(completionDate: string | null, expirationMonths: number | null): string | null {
	if (expirationMonths === null || !completionDate) return null;
	const date = parseDate(completionDate);
	date.setMonth(date.getMonth() + expirationMonths);
	return formatDate(date);
}

interface TrainingTypeRow {
	expiration_months: number | null;
	expiration_date_only: boolean;
}

export async function createTrainingRecord(ctx: UseCaseContext, input: Record<string, unknown>): Promise<unknown> {
	ctx.auth.requireEdit('training');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const validated = entity.createSchema.parse(input) as Record<string, unknown>;
	const personnelId = validated.personnelId as string;
	const trainingTypeId = validated.trainingTypeId as string;
	const completionDate = (validated.completionDate as string | null) ?? null;

	await ctx.auth.requireGroupAccess(personnelId);

	const trainingType = await ctx.store.findOne<TrainingTypeRow>(
		'training_types',
		ctx.auth.orgId,
		{ id: trainingTypeId },
		'expiration_months, expiration_date_only'
	);

	if (!trainingType) fail(404, 'Training type not found');

	const isExpirationDateOnly = trainingType.expiration_date_only ?? false;

	const expirationDate = isExpirationDateOnly
		? (input.expirationDate as string)
		: calculateExpirationDate(completionDate, trainingType.expiration_months);

	// Upsert: check for existing record with same personnel + type
	const existing = await ctx.store.findOne<{ id: string }>(entity.table, ctx.auth.orgId, {
		personnel_id: personnelId,
		training_type_id: trainingTypeId
	});

	let row: Record<string, unknown>;
	if (existing) {
		row = await ctx.store.update<Record<string, unknown>>(entity.table, ctx.auth.orgId, existing.id, {
			completion_date: completionDate ?? null,
			expiration_date: expirationDate ?? null,
			notes: validated.notes ?? null,
			certificate_url: validated.certificateUrl ?? null,
			updated_at: new Date().toISOString()
		});
	} else {
		const dbData = entity.toDbInsert(validated, ctx.auth.orgId);
		dbData.expiration_date = expirationDate ?? null;
		row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData);
	}

	ctx.audit.log({
		action: existing ? `${AUDIT_RESOURCE}.updated` : `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined
	});

	return entity.fromDb(row);
}

export async function deleteTrainingRecord(
	ctx: UseCaseContext,
	id: string
): Promise<{ requiresApproval: boolean } | void> {
	ctx.auth.requireEdit('training');

	await ctx.auth.requireGroupAccessByRecord(entity.table, id, 'personnel_id');

	if (!ctx.auth.isPrivileged && !ctx.auth.isFullEditor) {
		return { requiresApproval: true };
	}

	await ctx.store.delete(entity.table, ctx.auth.orgId, id);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});
}
