import { json, error } from '@sveltejs/kit';
import type { Cookies, RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { z } from 'zod';
import { getApiContext } from '$lib/server/supabase';
import {
	createPermissionContext,
	createPermissionContextFromMembership,
	type MembershipRow
} from '$lib/server/permissionContext';
import { validateUUID } from '$lib/server/validation';
import { getRequestInfo } from '$lib/server/auditLog';
import { createSupabaseDataStore } from './supabaseDataStore';
import { createSupabaseAuthContextAdapter, createSandboxAuthContext } from './supabaseAuthContext';
import { createSupabaseAuditAdapter } from './supabaseAudit';
import { createSupabaseReadOnlyGuard } from './supabaseReadOnlyGuard';
import { createSupabaseSubscriptionAdapter } from './supabaseSubscription';
import { createScopedDataStore } from './scopedDataStore';
import { defaultScopeRules } from './scopeRules';
import { createSupabaseNotificationAdapter } from './supabaseNotification';
import { createStripeBillingAdapter } from './stripeBilling';
import { createSupabaseStorageAdapter } from './supabaseStorage';
import type { UseCaseContext, WritePorts, FeatureArea } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import { createCrudUseCases, type CrudConfig } from '$lib/server/core/useCases/crud';
import type { EntityDefinition } from '$lib/server/entitySchema';

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

	const subscription = createSupabaseSubscriptionAdapter(supabase, orgId);
	const notifications = createSupabaseNotificationAdapter();
	const billing = createStripeBillingAdapter();
	const scopedStore = createScopedDataStore(store, auth.scopedGroupId, defaultScopeRules);
	return {
		ctx: {
			store: scopedStore,
			auth,
			audit,
			readOnlyGuard,
			subscription,
			notifications,
			billing,
			storage: createSupabaseStorageAdapter(supabase),
			rawStore: store
		},
		supabase,
		isSandbox
	};
}

/**
 * Provides the raw Supabase client and user info for org layout servers.
 * Org layouts need pre-auth data (org lookup, suspension check, demo mode)
 * before building a full UseCaseContext. This keeps getApiContext/getSupabaseClient
 * behind the adapter boundary.
 */
export function getLayoutClient(locals: App.Locals, cookies: Cookies, orgId: string) {
	return getApiContext(locals, cookies, orgId);
}

export async function buildRouteContext(event: RequestEvent): Promise<UseCaseContext> {
	const { ctx } = await buildContextInternal(event);
	return ctx;
}

/**
 * Build a UseCaseContext from layout/page server parameters.
 * Layout servers don't have a RequestEvent, so this accepts the raw pieces.
 * Audit is a no-op since layout loads are read-only data fetches.
 */
export async function buildLayoutContext(locals: App.Locals, cookies: Cookies, orgId: string): Promise<UseCaseContext> {
	if (!validateUUID(orgId)) {
		throw error(400, 'Invalid organization ID');
	}

	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	const store = createSupabaseDataStore(supabase);
	const readOnlyGuard = createSupabaseReadOnlyGuard(supabase, orgId);
	const audit = { log() {} };

	let auth;
	if (isSandbox) {
		auth = createSandboxAuthContext(orgId);
	} else {
		const permCtx = await createPermissionContext(supabase, userId!, orgId);
		auth = createSupabaseAuthContextAdapter(permCtx, supabase, userId, orgId);
	}

	const subscription = createSupabaseSubscriptionAdapter(supabase, orgId);
	const notifications = createSupabaseNotificationAdapter();
	const billing = createStripeBillingAdapter();
	const storage = createSupabaseStorageAdapter(supabase);
	const scopedStore = createScopedDataStore(store, auth.scopedGroupId, defaultScopeRules);
	return {
		store: scopedStore,
		auth,
		audit,
		readOnlyGuard,
		subscription,
		notifications,
		billing,
		storage,
		rawStore: store
	};
}

/**
 * Build a UseCaseContext using an already-fetched membership row.
 * Avoids re-querying organization_memberships when the layout already has the data.
 */
export async function buildLayoutContextFromMembership(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string,
	membership: MembershipRow
): Promise<UseCaseContext> {
	if (!validateUUID(orgId)) {
		throw error(400, 'Invalid organization ID');
	}

	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	const store = createSupabaseDataStore(supabase);
	const readOnlyGuard = createSupabaseReadOnlyGuard(supabase, orgId);
	const audit = { log() {} };

	let auth;
	if (isSandbox) {
		auth = createSandboxAuthContext(orgId);
	} else {
		const permCtx = createPermissionContextFromMembership(membership);
		auth = createSupabaseAuthContextAdapter(permCtx, supabase, userId, orgId);
	}

	const subscription = createSupabaseSubscriptionAdapter(supabase, orgId);
	const notifications = createSupabaseNotificationAdapter();
	const billing = createStripeBillingAdapter();
	const storage = createSupabaseStorageAdapter(supabase);
	const scopedStore = createScopedDataStore(store, auth.scopedGroupId, defaultScopeRules);
	return {
		store: scopedStore,
		auth,
		audit,
		readOnlyGuard,
		subscription,
		notifications,
		billing,
		storage,
		rawStore: store
	};
}

function rethrowOrWrap(err: unknown): never {
	if (err && typeof err === 'object' && 'status' in err) {
		throw err; // Re-throw SvelteKit HttpError or use-case fail()
	}
	throw error(500, 'Internal server error');
}

export function crudHandlers(config: CrudConfig): {
	POST: RequestHandler;
	PUT: RequestHandler;
	DELETE: RequestHandler;
} {
	const useCases = createCrudUseCases(config);

	// Use handle() as the HTTP shell — permission and read-only are enforced
	// by the crud use cases themselves (they predate handle()), so we pass
	// through without double-checking. The use case fn receives parsed body
	// as input.
	const POST = handle<Record<string, unknown>, unknown>({
		permission: config.permission,
		mutation: true,
		fn: (ctx, input) => useCases.create(ctx, input)
	});

	const PUT = handle<Record<string, unknown>, unknown>({
		permission: config.permission,
		mutation: true,
		fn: (ctx, input) => useCases.update(ctx, input)
	});

	const DELETE = handle<Record<string, unknown>, unknown>({
		permission: config.permission,
		mutation: true,
		fn: async (ctx, input) => {
			const id = input?.id;
			if (!id || typeof id !== 'string') {
				fail(400, 'Missing id');
			}
			if (!validateUUID(id)) {
				fail(400, 'Invalid resource ID');
			}
			await useCases.remove(ctx, id);
			return { success: true };
		}
	});

	return { POST, PUT, DELETE };
}

// ---------------------------------------------------------------------------
// handle() — unified route wrapper
// ---------------------------------------------------------------------------

export interface RouteConfig<TInput = void, TOutput = unknown> {
	permission: FeatureArea | 'manageMembers' | 'privileged' | 'owner';
	mutation?: boolean;
	input?: z.ZodType<TInput>;
	parseInput?: (event: RequestEvent) => TInput | Promise<TInput>;
	fn: (ctx: UseCaseContext, input: TInput) => Promise<TOutput>;
	formatOutput?: (result: TOutput) => Response;
	audit?: {
		action: string;
		resourceType: string;
		resourceId?: (result: TOutput) => string;
	};
}

function enforcePermission(ctx: UseCaseContext, config: RouteConfig<unknown, unknown>): void {
	const { permission, mutation } = config;

	switch (permission) {
		case 'privileged':
			ctx.auth.requirePrivileged();
			break;
		case 'owner':
			ctx.auth.requireOwner();
			break;
		case 'manageMembers':
			ctx.auth.requireManageMembers();
			break;
		default:
			if (mutation) {
				ctx.auth.requireEdit(permission);
			} else {
				ctx.auth.requireView(permission);
			}
	}
}

/**
 * Testable core of handle() — no HTTP/RequestEvent dependency.
 * Called by handle() after building context and parsing input from the request.
 */
export async function handleUseCaseRequest<TInput, TOutput>(
	config: RouteConfig<TInput, TOutput>,
	ctx: UseCaseContext,
	rawInput: unknown
): Promise<TOutput> {
	// 1. Permission check
	enforcePermission(ctx, config as RouteConfig<unknown, unknown>);

	// 2. Read-only guard for mutations
	if (config.mutation) {
		const isReadOnly = await ctx.readOnlyGuard.check();
		if (isReadOnly) {
			fail(403, 'Organization is in read-only mode');
		}
	}

	// 3. Zod input validation
	let input: TInput;
	if (config.input) {
		const result = config.input.safeParse(rawInput);
		if (!result.success) {
			fail(400, result.error.issues.map((i) => i.message).join('; '));
		}
		input = result.data;
	} else {
		input = rawInput as TInput;
	}

	// 4. Execute use case
	const output = await config.fn(ctx, input);

	// 5. Declarative audit
	if (config.audit) {
		ctx.audit.log({
			action: config.audit.action,
			resourceType: config.audit.resourceType,
			resourceId: config.audit.resourceId?.(output)
		});
	}

	return output;
}

// ---------------------------------------------------------------------------
// loadWithContext() — page loader wrapper
// ---------------------------------------------------------------------------

interface LoadConfig<T> {
	permission: FeatureArea | 'manageMembers' | 'privileged' | 'owner' | 'none';
	fn: (ctx: UseCaseContext) => Promise<T>;
	defer?: boolean;
}

function enforceLoadPermission(ctx: UseCaseContext, permission: LoadConfig<unknown>['permission']): void {
	if (permission === 'none') return;
	switch (permission) {
		case 'privileged':
			ctx.auth.requirePrivileged();
			break;
		case 'owner':
			ctx.auth.requireOwner();
			break;
		case 'manageMembers':
			ctx.auth.requireManageMembers();
			break;
		default:
			ctx.auth.requireView(permission);
	}
}

/**
 * Testable core of loadWithContext() — no SvelteKit dependency.
 *
 * Without `defer`: checks permissions and awaits the data (blocks navigation).
 * With `defer: true`: checks permissions eagerly, returns data as an unresolved
 * promise for SvelteKit streaming (navigation completes immediately, page shows
 * skeletons while data loads).
 */
export function loadWithContextCore<T>(
	ctx: UseCaseContext,
	config: LoadConfig<T> & { defer: true }
): { data: Promise<T> };
export function loadWithContextCore<T>(ctx: UseCaseContext, config: LoadConfig<T>): Promise<T>;
export function loadWithContextCore<T>(ctx: UseCaseContext, config: LoadConfig<T>): Promise<T> | { data: Promise<T> } {
	enforceLoadPermission(ctx, config.permission);

	if (config.defer) {
		return { data: config.fn(ctx) };
	}

	return config.fn(ctx);
}

/**
 * Page loader wrapper with mandatory permission declaration.
 * Wraps buildLayoutContext() for use in +page.server.ts / +layout.server.ts load functions.
 *
 * Without `defer`: awaits data before returning (standard blocking load).
 * With `defer: true`: permissions checked eagerly, data returned as an unresolved
 * promise that SvelteKit streams. Pages with skeleton UIs should use this to allow
 * instant navigation.
 */
export async function loadWithContext<T>(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string,
	config: LoadConfig<T> & { defer: true }
): Promise<{ data: Promise<T> }>;
export async function loadWithContext<T>(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string,
	config: LoadConfig<T>
): Promise<T>;
export async function loadWithContext<T>(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string,
	config: LoadConfig<T>
): Promise<T | { data: Promise<T> }> {
	const ctx = await buildLayoutContext(locals, cookies, orgId);
	return loadWithContextCore(ctx, config);
}

/**
 * Unified route handler — mandatory permission, auto read-only guard,
 * optional Zod validation, optional audit.
 */
export function handle<TInput, TOutput>(config: RouteConfig<TInput, TOutput>): RequestHandler {
	return async (event) => {
		try {
			const ctx = await buildRouteContext(event);

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

			const result = await handleUseCaseRequest(config, ctx, rawInput);

			if (config.formatOutput) {
				return config.formatOutput(result);
			}

			return json(result);
		} catch (err) {
			rethrowOrWrap(err);
		}
	};
}

// ---------------------------------------------------------------------------
// entityHandlers() — derive CRUD handlers from entity metadata
// ---------------------------------------------------------------------------

export interface EntityHandlerHooks {
	beforeDelete?: (ctx: WritePorts, id: string) => Promise<void>;
	afterDelete?: (ctx: WritePorts, id: string) => Promise<void>;
}

export interface EntityHandlersResult {
	POST?: RequestHandler;
	PUT?: RequestHandler;
	DELETE?: RequestHandler;
	/** Exposed for testing — the RouteConfig objects backing each handler */
	_configs: {
		POST?: RouteConfig<Record<string, unknown>, unknown>;
		PUT?: RouteConfig<Record<string, unknown>, unknown>;
		DELETE?: RouteConfig<Record<string, unknown>, unknown>;
	};
}

export function entityHandlers(entity: EntityDefinition, hooks?: EntityHandlerHooks): EntityHandlersResult {
	if (!entity.permission) {
		throw new Error(`entityHandlers: entity "${entity.table}" must have a permission defined`);
	}

	const auditResource = typeof entity.audit === 'string' ? entity.audit : (entity.audit?.resourceType ?? entity.table);

	const config: CrudConfig = {
		entity,
		permission: entity.permission,
		auditResource,
		requireFullEditor: entity.requireFullEditor,
		beforeDelete: hooks?.beforeDelete,
		afterDelete: hooks?.afterDelete
	};

	const useCases = createCrudUseCases(config);
	const methods = new Set(entity.methods);
	const result: EntityHandlersResult = { _configs: {} };

	if (methods.has('POST')) {
		const postConfig: RouteConfig<Record<string, unknown>, unknown> = {
			permission: entity.permission,
			mutation: true,
			fn: (ctx, input) => useCases.create(ctx, input)
		};
		result.POST = handle(postConfig);
		result._configs.POST = postConfig;
	}

	if (methods.has('PUT')) {
		const putConfig: RouteConfig<Record<string, unknown>, unknown> = {
			permission: entity.permission,
			mutation: true,
			fn: (ctx, input) => useCases.update(ctx, input)
		};
		result.PUT = handle(putConfig);
		result._configs.PUT = putConfig;
	}

	if (methods.has('DELETE')) {
		const deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
			permission: entity.permission,
			mutation: true,
			fn: async (ctx, input) => {
				const id = input?.id;
				if (!id || typeof id !== 'string') {
					fail(400, 'Missing id');
				}
				if (!validateUUID(id)) {
					fail(400, 'Invalid resource ID');
				}
				await useCases.remove(ctx, id);
				return { success: true };
			}
		};
		result.DELETE = handle(deleteConfig);
		result._configs.DELETE = deleteConfig;
	}

	return result;
}
