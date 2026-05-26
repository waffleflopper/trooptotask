import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/server/core/useCases/featurePolicy';

export const _deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const { id } = input;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		const person = await ctx.store.findOne<{
			rank: string;
			first_name: string;
			last_name: string;
			group_id: string | null;
			archived_at: string | null;
		}>('personnel', ctx.auth.orgId, { id });

		if (!person) fail(404, 'Personnel not found');
		if (!person.archived_at) fail(400, 'Can only permanently delete archived personnel');

		await requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
			policyResourceForGroup(person.group_id),
			'personnel',
			id
		);

		await ctx.store.delete('personnel', ctx.auth.orgId, id);

		const personName = `${person.rank} ${person.last_name}, ${person.first_name}`;

		ctx.audit.log({
			action: 'personnel.permanently_deleted',
			resourceType: 'personnel',
			resourceId: id,
			details: { name: personName }
		});

		await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'personnel_permanently_deleted',
			title: 'Personnel Permanently Deleted',
			message: `Personnel "${personName}" was permanently deleted.`
		});

		return { success: true };
	}
};

export const DELETE = handle(_deleteConfig);
