import type { RequestHandler } from './$types';
import { adminHandle, type AdminRouteConfig } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAdministration } from '$lib/server/adapters/supabasePlatformAdministration';
import type { PlatformAdministrationSearchResult } from '$lib/server/core/useCases/platformAdministration';

export const _getConfig: AdminRouteConfig<string, PlatformAdministrationSearchResult> = {
	requiredRole: ['super_admin', 'support'],
	parseInput: (event) => {
		return event.url.searchParams.get('q') ?? '';
	},
	fn: async (ctx, rawQuery) => {
		return createSupabasePlatformAdministration(ctx).search({ query: rawQuery });
	}
};

export const GET: RequestHandler = adminHandle(_getConfig);
