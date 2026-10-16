import { error } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';
import type { SavedTrainingType, SavedTrainingView } from '../contracts';
import type {
	TrainingTypeCreateContext,
	TrainingTypeUpdateContext,
	TrainingTypeDeleteContext,
	TrainingTypeDeletionRequestContext,
	TrainingViewCreateContext,
	TrainingViewUpdateContext,
	TrainingViewDeleteContext
} from './trainingCatalogPorts.server';
import {
	trainingTypeCreateInput,
	trainingTypeUpdateInput,
	trainingViewCreateInput,
	trainingViewUpdateInput,
	TRAINING_TYPE_UNAVAILABLE_MESSAGE
} from './trainingPersistenceMapping.server';

const configureAction = POLICY_ACTION_CATALOG.training.configureRequirements;
const catalogResource = { kind: 'organization' } as const;

export async function createTrainingType(
	ctx: TrainingTypeCreateContext,
	input: Record<string, unknown>
): Promise<SavedTrainingType> {
	const parsed = trainingTypeCreateInput.safeParse(input);
	if (!parsed.success) error(400, issueMessage(parsed.error));
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_type');
	const row = await ctx.trainingCatalog.createType(parsed.data);
	ctx.audit.log({
		action: 'training_type.created',
		resourceType: 'training_type',
		resourceId: row.id
	});
	return row;
}

export async function updateTrainingType(
	ctx: TrainingTypeUpdateContext,
	input: Record<string, unknown>
): Promise<SavedTrainingType> {
	const parsed = trainingTypeUpdateInput.safeParse(input);
	if (!parsed.success) error(400, issueMessage(parsed.error));
	const id = parsed.data.id as string;
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_type', id);
	const row = await ctx.trainingCatalog.patchType(id, parsed.data);
	if (!row) fail(404, TRAINING_TYPE_UNAVAILABLE_MESSAGE);
	ctx.audit.log({ action: 'training_type.updated', resourceType: 'training_type', resourceId: id });
	return row;
}

export async function deleteTrainingType(ctx: TrainingTypeDeleteContext, id: string): Promise<void> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_type', id);
	await ctx.trainingCatalog.deleteType(id);
	ctx.audit.log({ action: 'training_type.deleted', resourceType: 'training_type', resourceId: id });
	await ctx.notifyTrainingTypeDeleted();
}

/** Describes a deletion request from the Organization type the requester may configure. */
export async function describeTrainingTypeDeletionRequest(
	ctx: TrainingTypeDeletionRequestContext,
	id: string
): Promise<{ description: string; url: string }> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_type', id);
	const type = (await ctx.trainingCatalog.listTypeLabels()).find((label) => label.id === id);
	if (!type) fail(404, 'Training type not found');
	return { description: `Training type ${type.name}`, url: `/org/${ctx.auth.orgId}/training` };
}

export async function createTrainingView(
	ctx: TrainingViewCreateContext,
	input: Record<string, unknown>
): Promise<SavedTrainingView> {
	const parsed = trainingViewCreateInput.safeParse(input);
	if (!parsed.success) error(400, issueMessage(parsed.error));
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_view');
	const row = await ctx.trainingCatalog.createView(parsed.data);
	ctx.audit.log({
		action: 'training_view.created',
		resourceType: 'training_view',
		resourceId: row.id
	});
	return row;
}

export async function updateTrainingView(
	ctx: TrainingViewUpdateContext,
	input: Record<string, unknown>
): Promise<SavedTrainingView> {
	const parsed = trainingViewUpdateInput.safeParse(input);
	if (!parsed.success) error(400, issueMessage(parsed.error));
	const id = parsed.data.id as string;
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_view', id);
	const row = await ctx.trainingCatalog.patchView(id, parsed.data);
	if (!row) fail(404, 'That Training view is no longer available.');
	ctx.audit.log({ action: 'training_view.updated', resourceType: 'training_view', resourceId: id });
	return row;
}

export async function deleteTrainingView(ctx: TrainingViewDeleteContext, id: string): Promise<void> {
	await requireFeaturePolicy(ctx, configureAction, catalogResource, 'training_view', id);
	await ctx.trainingCatalog.deleteView(id);
	ctx.audit.log({ action: 'training_view.deleted', resourceType: 'training_view', resourceId: id });
}
