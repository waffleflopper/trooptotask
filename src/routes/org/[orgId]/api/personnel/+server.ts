import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { canAddPersonnel, invalidateTierCache } from '$lib/server/subscription';
import { auditLog } from '$lib/server/auditLog';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import { createPersonnelUseCases } from '$lib/server/core/useCases/personnel';
import { getApiContext } from '$lib/server/supabase';
import { validateUUID } from '$lib/server/validation';

function getSubscription(event: RequestEvent) {
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);
	return createSupabaseSubscriptionAdapter(supabase, orgId);
}

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const subscription = getSubscription(event);
	const { create } = createPersonnelUseCases(subscription);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	try {
		const result = await create(ctx, body);
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};

export const PUT = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const subscription = getSubscription(event);
	const { update } = createPersonnelUseCases(subscription);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	try {
		const result = await update(ctx, body);
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const subscription = getSubscription(event);
	const { archive } = createPersonnelUseCases(subscription);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	const id = body.id;
	if (!id || typeof id !== 'string') throw error(400, 'Missing id');
	if (!validateUUID(id)) throw error(400, 'Invalid resource ID');

	try {
		const result = await archive(ctx, id);
		if (result?.requiresApproval) {
			return json({ requiresApproval: true }, { status: 202 });
		}
		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Internal server error');
	}
};

// Restore stays on legacy apiRoute — privileged-only, not yet migrated
export const PATCH = apiRoute(
	{ permission: { privileged: true }, blockSandbox: true },
	async ({ supabase, orgId, userId }, event) => {
		const body = await event.request.json();
		const { action, id } = body;

		if (action !== 'restore') throw error(400, 'Invalid action');
		if (!id) throw error(400, 'Missing id');

		const capCheck = await canAddPersonnel(supabase, orgId);
		if (!capCheck.allowed) {
			return json({ message: capCheck.message }, { status: 422 });
		}

		const { data: person } = await supabase
			.from('personnel')
			.select('rank, first_name, last_name, archived_at')
			.eq('id', id)
			.eq('organization_id', orgId)
			.single();

		if (!person) throw error(404, 'Personnel not found');
		if (!person.archived_at) throw error(400, 'Personnel is not archived');

		const { error: dbError } = await supabase
			.from('personnel')
			.update({ archived_at: null })
			.eq('id', id)
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		invalidateTierCache(orgId);

		auditLog(
			{
				action: 'personnel.restored',
				resourceType: 'personnel',
				resourceId: id,
				orgId,
				details: {
					actor: event.locals.user?.email ?? userId,
					name: `${person.rank} ${person.last_name}, ${person.first_name}`
				}
			},
			{ userId }
		);

		return json({ success: true });
	}
);
