import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const _deleteConfig: RouteConfig<{ rosterId: string }, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({
		rosterId: event.params.id as string
	}),
	fn: async (ctx, input) => {
		const roster = await ctx.store.findOne<{ signed_file_path: string | null; title: string }>(
			'sign_in_rosters',
			ctx.auth.orgId,
			{ id: input.rosterId }
		);

		if (!roster) fail(404, 'Roster not found');

		await ctx.store.delete('sign_in_rosters', ctx.auth.orgId, input.rosterId);

		if (roster.signed_file_path) {
			await ctx.storage.remove(SENSITIVE_FILE_BUCKET, [roster.signed_file_path]);
		}

		ctx.audit.log({
			action: 'sign_in_roster.deleted',
			resourceType: 'sign_in_roster',
			resourceId: input.rosterId,
			details: { title: roster.title }
		});

		return { success: true };
	}
};

export const DELETE = handle(_deleteConfig);
