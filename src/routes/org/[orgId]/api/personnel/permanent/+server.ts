import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { permanentlyDeletePersonnelRecord } from '$features/personnel/index.server';

export const _deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const { id } = input;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		return permanentlyDeletePersonnelRecord(ctx, id, (name) =>
			ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
				type: 'personnel_permanently_deleted',
				title: 'Personnel Permanently Deleted',
				message: `Personnel "${name}" was permanently deleted.`
			})
		);
	}
};

export const DELETE = handle(_deleteConfig);
