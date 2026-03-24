import { json, error, redirect, fail } from '@sveltejs/kit';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { canAccessPage, getAdminRole, type AdminRole } from '$lib/server/admin';
import { getAdminClient } from '$lib/server/supabase';
import { auditLog, getRequestInfo } from '$lib/server/auditLog';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// AdminContext — the admin equivalent of UseCaseContext
// ---------------------------------------------------------------------------

export interface AdminContext {
	adminUser: { id: string; role: AdminRole };
	adminClient: SupabaseClient;
	audit(event: {
		action: string;
		resourceType: string;
		resourceId?: string;
		details?: Record<string, unknown>;
		severity?: 'info' | 'warning' | 'critical';
	}): void;
}

function adminError(status: number, message: string): Error {
	const err = new Error(message);
	(err as Error & { status: number }).status = status;
	return err;
}

// ---------------------------------------------------------------------------
// buildAdminContextCore — testable core (no SvelteKit dependency)
// ---------------------------------------------------------------------------

interface BuildAdminContextParams {
	userId: string;
	lookupRole: (userId: string) => Promise<AdminRole | null>;
	requestInfo: { userId: string | null; ip: string; userAgent: string };
	requiredPage?: string;
	/** Override for tests — avoids calling getAdminClient() which needs real env vars */
	adminClient?: SupabaseClient;
}

export async function buildAdminContextCore(params: BuildAdminContextParams): Promise<AdminContext> {
	const role = await params.lookupRole(params.userId);
	if (!role) {
		throw adminError(403, 'Access denied. Platform admin required.');
	}

	if (params.requiredPage && !canAccessPage(role, params.requiredPage)) {
		throw adminError(403, 'Not authorized for this page.');
	}

	const reqInfo = params.requestInfo;
	return {
		adminUser: { id: params.userId, role },
		adminClient: params.adminClient ?? getAdminClient(),
		audit(event) {
			auditLog(event, reqInfo);
		}
	};
}

// ---------------------------------------------------------------------------
// loadWithAdminContextCore — testable core for page loaders
// ---------------------------------------------------------------------------

export interface AdminLoadConfig<T> {
	requiredRole?: AdminRole;
	fn: (ctx: AdminContext, event: RequestEvent) => Promise<T>;
}

export async function loadWithAdminContextCore<T>(
	ctx: AdminContext,
	config: AdminLoadConfig<T>,
	event: RequestEvent
): Promise<T> {
	if (config.requiredRole && ctx.adminUser.role !== config.requiredRole) {
		throw adminError(403, 'Not authorized for this action.');
	}
	return config.fn(ctx, event);
}

// ---------------------------------------------------------------------------
// adminHandleCore — testable core for API route handlers
// ---------------------------------------------------------------------------

export interface AdminRouteConfig<TInput = void, TOutput = unknown> {
	requiredRole?: AdminRole;
	parseInput?: (event: RequestEvent) => TInput | Promise<TInput>;
	fn: (ctx: AdminContext, input: TInput) => Promise<TOutput>;
}

export async function adminHandleCore<TInput, TOutput>(
	ctx: AdminContext,
	config: AdminRouteConfig<TInput, TOutput>,
	rawInput: unknown
): Promise<TOutput> {
	if (config.requiredRole && ctx.adminUser.role !== config.requiredRole) {
		throw adminError(403, 'Not authorized for this action.');
	}
	return config.fn(ctx, rawInput as TInput);
}

// ---------------------------------------------------------------------------
// SvelteKit wrappers — thin HTTP shells
// ---------------------------------------------------------------------------

function rethrowOrWrap(err: unknown): never {
	if (err && typeof err === 'object' && 'status' in err) {
		throw err;
	}
	throw error(500, 'Internal server error');
}

async function resolveAdminContext(
	locals: App.Locals,
	event: RequestEvent,
	requiredPage?: string
): Promise<AdminContext> {
	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login');

	return buildAdminContextCore({
		userId: user.id,
		lookupRole: (userId) => getAdminRole(locals.supabase, userId),
		requestInfo: getRequestInfo(event),
		requiredPage
	});
}

/**
 * Page loader wrapper for admin pages.
 * Verifies platform admin access, optionally checks page access, then delegates to fn.
 */
export function loadWithAdminContext<T>(config: AdminLoadConfig<T> & { page?: string }) {
	return async (event: RequestEvent) => {
		try {
			const ctx = await resolveAdminContext(event.locals, event, config.page);
			return loadWithAdminContextCore(ctx, config, event);
		} catch (err) {
			rethrowOrWrap(err);
		}
	};
}

/**
 * Form action wrapper for admin pages.
 * Builds AdminContext (with page access check), then delegates to fn.
 * The fn receives the full SvelteKit event so it can call request.formData().
 */
export function adminAction<T>(config: {
	page?: string;
	requiredRole?: AdminRole;
	fn: (ctx: AdminContext, event: RequestEvent) => Promise<T>;
}) {
	return async (event: RequestEvent) => {
		try {
			const ctx = await resolveAdminContext(event.locals, event, config.page);
			if (config.requiredRole && ctx.adminUser.role !== config.requiredRole) {
				return fail(403, { error: 'Not authorized for this action.' });
			}
			return config.fn(ctx, event);
		} catch (err) {
			rethrowOrWrap(err);
		}
	};
}

/**
 * API route handler wrapper for admin API routes.
 * Verifies platform admin access, parses JSON body, delegates to fn, returns json().
 */
export function adminHandle<TInput, TOutput>(
	config: AdminRouteConfig<TInput, TOutput> & { page?: string }
): RequestHandler {
	return async (event) => {
		try {
			const ctx = await resolveAdminContext(event.locals, event, config.page);

			let rawInput: unknown;
			if (config.parseInput) {
				rawInput = await config.parseInput(event);
			} else if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
				try {
					rawInput = await event.request.json();
				} catch {
					throw error(400, 'Invalid JSON in request body');
				}
			}

			const result = await adminHandleCore(ctx, config, rawInput);
			return json(result);
		} catch (err) {
			rethrowOrWrap(err);
		}
	};
}
