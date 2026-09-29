import { error } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { TrainingType, TrainingView } from '../contracts';
import type { TrainingCatalogDeleteContext, TrainingCatalogWriteContext } from './trainingCatalogPorts.server';
import { TrainingTypeEntity } from './trainingTypeEntity.server';
import { TrainingViewEntity } from './trainingViewEntity.server';

const configureAction = POLICY_ACTION_CATALOG.training.configureRequirements;
const catalogResource = { kind: 'organization' } as const;

function invalidInput(issues: Array<{ message: string }>): never {
	throw error(400, issues.map((issue) => issue.message).join('; '));
}

export async function createTrainingType(
	ctx: TrainingCatalogWriteContext,
	input: Record<string, unknown>
): Promise<TrainingType> {
	const parsed = TrainingTypeEntity.createSchema.safeParse(input);
	if (!parsed.success) invalidInput(parsed.error.issues);
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_type');
	const row = await ctx.store.insert<Record<string, unknown>>(
		TrainingTypeEntity.table,
		ctx.auth.orgId,
		TrainingTypeEntity.toDbInsert(parsed.data, ctx.auth.orgId),
		TrainingTypeEntity.select
	);
	ctx.audit.log({
		action: 'training_type.created',
		resourceType: 'training_type',
		resourceId: row.id as string | undefined
	});
	return TrainingTypeEntity.fromDb(row);
}

export async function updateTrainingType(
	ctx: TrainingCatalogWriteContext,
	input: Record<string, unknown>
): Promise<TrainingType> {
	const parsed = TrainingTypeEntity.updateSchema.safeParse(input);
	if (!parsed.success) invalidInput(parsed.error.issues);
	const id = parsed.data.id as string;
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_type', id);
	const row = await ctx.store.update<Record<string, unknown>>(
		TrainingTypeEntity.table,
		ctx.auth.orgId,
		id,
		TrainingTypeEntity.toDbUpdate(parsed.data),
		TrainingTypeEntity.select
	);
	ctx.audit.log({ action: 'training_type.updated', resourceType: 'training_type', resourceId: id });
	return TrainingTypeEntity.fromDb(row);
}

export async function deleteTrainingType(ctx: TrainingCatalogDeleteContext, id: string): Promise<void> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_type', id);
	await ctx.store.deleteWhere('personnel_trainings', ctx.auth.orgId, { training_type_id: id });
	await ctx.store.delete(TrainingTypeEntity.table, ctx.auth.orgId, id);
	ctx.audit.log({ action: 'training_type.deleted', resourceType: 'training_type', resourceId: id });
	await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
		type: 'config_type_deleted',
		title: 'Training Type Deleted',
		message: 'A training type was deleted.'
	});
}

export async function createTrainingView(
	ctx: TrainingCatalogWriteContext,
	input: Record<string, unknown>
): Promise<TrainingView> {
	const parsed = TrainingViewEntity.createSchema.safeParse(input);
	if (!parsed.success) invalidInput(parsed.error.issues);
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_view');
	const row = await ctx.store.insert<Record<string, unknown>>(
		TrainingViewEntity.table,
		ctx.auth.orgId,
		TrainingViewEntity.toDbInsert(parsed.data, ctx.auth.orgId),
		TrainingViewEntity.select
	);
	ctx.audit.log({
		action: 'training_view.created',
		resourceType: 'training_view',
		resourceId: row.id as string | undefined
	});
	return TrainingViewEntity.fromDb(row);
}

export async function updateTrainingView(
	ctx: TrainingCatalogWriteContext,
	input: Record<string, unknown>
): Promise<TrainingView> {
	const parsed = TrainingViewEntity.updateSchema.safeParse(input);
	if (!parsed.success) invalidInput(parsed.error.issues);
	const id = parsed.data.id as string;
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_view', id);
	const row = await ctx.store.update<Record<string, unknown>>(
		TrainingViewEntity.table,
		ctx.auth.orgId,
		id,
		TrainingViewEntity.toDbUpdate(parsed.data),
		TrainingViewEntity.select
	);
	ctx.audit.log({ action: 'training_view.updated', resourceType: 'training_view', resourceId: id });
	return TrainingViewEntity.fromDb(row);
}

export async function deleteTrainingView(ctx: TrainingCatalogWriteContext, id: string): Promise<void> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_view', id);
	await ctx.store.delete(TrainingViewEntity.table, ctx.auth.orgId, id);
	ctx.audit.log({ action: 'training_view.deleted', resourceType: 'training_view', resourceId: id });
}
