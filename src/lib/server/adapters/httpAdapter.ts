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

interface BuildContextResult {
	ctx: UseCaseContext;
	supabase: ReturnType<typeof getApiContext>['supabase'];
	isSandbox: boolean;
}

async function buildContextInternal(event: RequestEvent): Promise<BuildContextResult> {
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

	return { ctx: { store, auth, audit, readOnlyGuard }, supabase, isSandbox };
}

export async function buildContext(event: RequestEvent): Promise<UseCaseContext> {
	const { ctx } = await buildContextInternal(event);
	return ctx;
}

export { buildContextInternal };

function rethrowOrWrap(err: unknown): never {
	if (err && typeof err === 'object' && 'status' in err) {
		throw err; // Re-throw SvelteKit HttpError or use-case fail()
	}
	throw error(500, 'Internal server error');
}

export function bodyHandler(
	useCase: (ctx: UseCaseContext, data: Record<string, unknown>) => Promise<unknown>
): RequestHandler {
	return async (event) => {
		try {
			const ctx = await buildContext(event);

			let body: Record<string, unknown>;
			try {
				body = (await event.request.json()) as Record<string, unknown>;
			} catch {
				throw error(400, 'Invalid JSON in request body');
			}

			const result = await useCase(ctx, body);
			return json(result);
		} catch (err) {
			rethrowOrWrap(err);
		}
	};
}

export const postHandler = bodyHandler;
export const putHandler = bodyHandler;

export function deleteHandler(useCase: (ctx: UseCaseContext, id: string) => Promise<void>): RequestHandler {
	return async (event) => {
		try {
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

			await useCase(ctx, id);
			return json({ success: true });
		} catch (err) {
			rethrowOrWrap(err);
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
