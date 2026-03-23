import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import { getApiContext } from '$lib/server/supabase';
import { importPersonnelBatch } from '$lib/server/core/useCases/personnelBatch';

function getSubscription(event: RequestEvent) {
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);
	return createSupabaseSubscriptionAdapter(supabase, orgId);
}

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const subscription = getSubscription(event);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	try {
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
		if (err && typeof err === 'object' && 'status' in err) {
			const status = (err as Record<string, unknown>).status as number;
			throw error(status, (err as unknown as Error).message);
		}
		throw error(500, 'Internal server error');
	}
};
