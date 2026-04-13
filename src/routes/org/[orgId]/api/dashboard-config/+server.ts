import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { DashboardConfig } from '$features/dashboard/dashboard.types';
import { DEFAULT_DASHBOARD_CONFIG } from '$features/dashboard/dashboard.types';

interface DashboardConfigRow {
	id: string;
	user_id: string;
	org_id: string;
	config: DashboardConfig;
	updated_at: string;
}

interface DashboardConfigResponse {
	config: DashboardConfig;
}

// ---------------------------------------------------------------------------
// GET — fetch user's dashboard config (falls back to default if not set)
// ---------------------------------------------------------------------------

export const _getConfig: RouteConfig<void, DashboardConfigResponse> = {
	permission: 'none',
	fn: async (ctx: UseCaseContext) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		const existing = await ctx.store.findOne<DashboardConfigRow>('dashboard_configs', ctx.auth.orgId, {
			user_id: userId
		});

		return { config: existing?.config ?? DEFAULT_DASHBOARD_CONFIG };
	}
};

export const GET = handle(_getConfig);

// ---------------------------------------------------------------------------
// PUT — upsert user's dashboard config
// ---------------------------------------------------------------------------

export const _putConfig: RouteConfig<DashboardConfig, DashboardConfigResponse> = {
	permission: 'none',
	mutation: true,
	fn: async (ctx: UseCaseContext, input: DashboardConfig) => {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Unauthorized');

		const existing = await ctx.store.findOne<DashboardConfigRow>('dashboard_configs', ctx.auth.orgId, {
			user_id: userId
		});

		if (existing) {
			await ctx.store.update('dashboard_configs', ctx.auth.orgId, existing.id, {
				config: input
			});
		} else {
			await ctx.store.insert('dashboard_configs', ctx.auth.orgId, {
				user_id: userId,
				config: input
			});
		}

		return { config: input };
	}
};

export const PUT = handle(_putConfig);
