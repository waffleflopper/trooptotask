import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';
import { createPersonnelUseCases } from '$lib/server/core/useCases/personnel';
import { restorePersonnelOwnedArtifacts } from '$lib/server/core/useCases/personnelArchivedArtifacts';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/server/core/useCases/featurePolicy';

const useCases = createPersonnelUseCases();

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => useCases.create(ctx, input)
};

export const POST = handle(_postConfig);

export const _putConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => useCases.update(ctx, input)
};

export const PUT = handle(_putConfig);

export const _deleteConfig: RouteConfig<Record<string, unknown>, Record<string, unknown>> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');

		const result = await useCases.archive(ctx, id);
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
};

export const DELETE = handle(_deleteConfig);

export const _patchConfig: RouteConfig<Record<string, unknown>, Record<string, unknown>> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.restoreRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		return event.request.json();
	},
	fn: async (ctx, input) => {
		const { action, id } = input;

		if (action !== 'restore') fail(400, 'Invalid action');
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		const capCheck = await ctx.subscription.canAddPersonnel();
		if (!capCheck.allowed) {
			return { message: capCheck.message };
		}

		const person = await ctx.store.findOne<{
			rank: string;
			first_name: string;
			last_name: string;
			group_id: string | null;
			archived_at: string | null;
		}>('personnel', ctx.auth.orgId, { id: id as string });

		if (!person) fail(404, 'Personnel not found');
		if (!person.archived_at) fail(400, 'Personnel is not archived');

		await requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.personnel.restoreRecords,
			policyResourceForGroup(person.group_id),
			'personnel',
			id as string
		);

		const personnelArchivedAt = person.archived_at;
		await ctx.store.update('personnel', ctx.auth.orgId, id as string, { archived_at: null });
		await restorePersonnelOwnedArtifacts(ctx, [id as string], personnelArchivedAt);

		ctx.subscription.invalidateTierCache();

		ctx.audit.log({
			action: 'personnel.restored',
			resourceType: 'personnel',
			resourceId: id as string,
			details: {
				name: `${person.rank} ${person.last_name}, ${person.first_name}`
			}
		});

		return { success: true };
	},
	formatOutput: (result) => {
		if (result.message && !result.success) {
			return json(result, { status: 422 });
		}
		return json(result);
	}
};

export const PATCH = handle(_patchConfig);
