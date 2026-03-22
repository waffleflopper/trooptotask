import { json, error } from '@sveltejs/kit';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { getApiContext } from '$lib/server/supabase';
import { createPermissionContext, createSandboxContext } from '$lib/server/permissionContext';
import { validateUUID } from '$lib/server/validation';
import { getRequestInfo } from '$lib/server/auditLog';
import { createSupabaseDataStore } from './supabaseDataStore';
import { createSupabaseAuthContextAdapter, createSandboxAuthContext } from './supabaseAuthContext';
import { createSupabaseAuditAdapter } from './supabaseAudit';
import { createSupabaseReadOnlyGuard } from './supabaseReadOnlyGuard';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createCrudUseCases, type CrudConfig } from '$lib/server/core/useCases/crud';

export async function buildContext(event: RequestEvent): Promise<UseCaseContext> {
	const orgId = event.params.orgId as string;

	if (!validateUUID(orgId)) {
		throw error(400, 'Invalid organization ID');
	}

	const { supabase, userId, isSandbox } = getApiContext(event.locals, event.cookies, orgId);
	const requestInfo = getRequestInfo(event);

	const store = createSupabaseDataStore(supabase);
	const readOnlyGuard = createSupabaseReadOnlyGuard(supabase, orgId);
	const audit = createSupabaseAuditAdapter(orgId, requestInfo);

	let auth;
	if (isSandbox) {
		auth = createSandboxAuthContext(orgId);
	} else {
		const permCtx = await createPermissionContext(supabase, userId!, orgId);
		auth = createSupabaseAuthContextAdapter(permCtx, supabase, userId, orgId);
	}

	return { store, auth, audit, readOnlyGuard };
}

export function postHandler(
	useCase: (ctx: UseCaseContext, data: Record<string, unknown>) => Promise<unknown>
): RequestHandler {
	return async (event) => {
		const ctx = await buildContext(event);

		let body: Record<string, unknown>;
		try {
			body = (await event.request.json()) as Record<string, unknown>;
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}

		try {
			const result = await useCase(ctx, body);
			return json(result);
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err) {
				throw err; // Re-throw SvelteKit HttpError
			}
			throw error(500, 'Internal server error');
		}
	};
}

export function putHandler(
	useCase: (ctx: UseCaseContext, data: Record<string, unknown>) => Promise<unknown>
): RequestHandler {
	return async (event) => {
		const ctx = await buildContext(event);

		let body: Record<string, unknown>;
		try {
			body = (await event.request.json()) as Record<string, unknown>;
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}

		try {
			const result = await useCase(ctx, body);
			return json(result);
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err) {
				throw err;
			}
			throw error(500, 'Internal server error');
		}
	};
}

export function deleteHandler(useCase: (ctx: UseCaseContext, id: string) => Promise<void>): RequestHandler {
	return async (event) => {
		const ctx = await buildContext(event);

		let body: Record<string, unknown>;
		try {
			body = (await event.request.json()) as Record<string, unknown>;
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}

		const id = body.id;
		if (!id || typeof id !== 'string') {
			throw error(400, 'Missing id');
		}
		if (!validateUUID(id)) {
			throw error(400, 'Invalid resource ID');
		}

		try {
			await useCase(ctx, id);
			return json({ success: true });
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err) {
				throw err;
			}
			throw error(500, 'Internal server error');
		}
	};
}

export function crudHandlers(config: CrudConfig): {
	POST: RequestHandler;
	PUT: RequestHandler;
	DELETE: RequestHandler;
} {
	const useCases = createCrudUseCases(config);

	return {
		POST: postHandler(useCases.create),
		PUT: putHandler(useCases.update),
		DELETE: deleteHandler(useCases.remove)
	};
}
