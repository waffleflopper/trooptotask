import type { RequestHandler } from './$types';
import { adminHandle } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAdministration } from '$lib/server/adapters/supabasePlatformAdministration';

export const GET: RequestHandler = adminHandle({
	parseInput: (event) => {
		return event.url.searchParams.get('q') ?? '';
	},
	fn: async (ctx, rawQuery) => {
		return createSupabasePlatformAdministration(ctx).search({ query: rawQuery });
	}
});
