import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContextInternal } from '$lib/server/adapters/httpAdapter';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import { importPersonnelBatch } from '$lib/server/core/useCases/personnelBatch';

export const POST = async (event: RequestEvent) => {
	try {
		const { ctx, supabase } = await buildContextInternal(event);
		const subscription = createSupabaseSubscriptionAdapter(supabase, ctx.auth.orgId);

		let body: Record<string, unknown>;
		try {
			body = (await event.request.json()) as Record<string, unknown>;
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}

		const result = await importPersonnelBatch(ctx, subscription, {
			records: body.records as Array<{
				rank: string;
				lastName: string;
				firstName: string;
				mos?: string;
				clinicRole?: string;
				groupName?: string;
			}>
		});
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};
