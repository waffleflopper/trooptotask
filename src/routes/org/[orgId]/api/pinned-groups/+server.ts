import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { createPinnedGroupUseCases } from '$lib/server/core/useCases/pinnedGroupCrud';

const useCases = createPinnedGroupUseCases();

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	try {
		if (body.action === 'replace') {
			const groups = (body.groups as string[]) ?? [];
			const result = await useCases.replace(ctx, groups);
			return json(result);
		}

		const result = await useCases.pin(ctx, {
			groupName: body.groupName as string,
			sortOrder: (body.sortOrder as number) ?? 0
		});
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Internal server error');
	}
};

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	try {
		const result = await useCases.unpin(ctx, body.groupName as string);
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Internal server error');
	}
};
