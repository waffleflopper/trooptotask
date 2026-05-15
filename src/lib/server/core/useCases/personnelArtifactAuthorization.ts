import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { policyResourceForPersonnel, requireFeaturePolicy } from './featurePolicy';

export async function requirePersonnelArtifactAccess(ctx: UseCaseContext, personnelId: string): Promise<void> {
	const person = await (ctx.rawStore ?? ctx.store).findOne<{ id: string }>(
		'personnel',
		ctx.auth.orgId,
		{ id: personnelId },
		'id'
	);
	if (!person) fail(404, 'Personnel record not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		await policyResourceForPersonnel(ctx, personnelId),
		'personnel',
		personnelId
	);
	await ctx.auth.requireGroupAccess(personnelId);
}
