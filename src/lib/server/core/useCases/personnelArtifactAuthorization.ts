import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';

const artifactAccessCache = new WeakMap<UseCaseContext, Map<string, Promise<void>>>();

export async function requirePersonnelArtifactAccess(ctx: UseCaseContext, personnelId: string): Promise<void> {
	let orgCache = artifactAccessCache.get(ctx);
	if (!orgCache) {
		orgCache = new Map();
		artifactAccessCache.set(ctx, orgCache);
	}

	const cacheKey = `${ctx.auth.orgId}:${personnelId}`;
	const cached = orgCache.get(cacheKey);
	if (cached) return cached;

	const accessCheck = requirePersonnelArtifactAccessUncached(ctx, personnelId);
	orgCache.set(cacheKey, accessCheck);
	return accessCheck;
}

async function requirePersonnelArtifactAccessUncached(ctx: UseCaseContext, personnelId: string): Promise<void> {
	const person = await (ctx.rawStore ?? ctx.store).findOne<{ id: string; group_id: string | null }>(
		'personnel',
		ctx.auth.orgId,
		{ id: personnelId },
		'id, group_id'
	);
	if (!person) fail(404, 'Personnel record not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(person.group_id),
		'personnel',
		personnelId
	);
	await ctx.auth.requireGroupAccess(personnelId);
}
