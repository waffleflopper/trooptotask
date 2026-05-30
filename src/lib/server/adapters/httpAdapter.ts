/**
 * HTTP adapter — the bridge between SvelteKit routes and use cases.
 *
 * Three primary exports for route authors:
 * - `handle(config)` — wraps a use case as a SvelteKit RequestHandler. Builds UseCaseContext,
 *   parses + validates input, enforces permissions, calls the use case, and formats the response.
 * - `entityHandlers(entity, hooks?)` — generates POST/PUT/DELETE handlers from an EntityDefinition.
 *   The standard way to wire up CRUD endpoints; prefer over `handle()` for entity routes.
 * - `loadWithContext(locals, cookies, orgId, config)` — for page load functions. Builds context
 *   from a layout-fetched membership row and runs the load fn with permission checks.
 *
 * Internal helpers (`buildRouteContext`, `buildLayoutContext`, `getLayoutClient`) are not
 * intended for direct use in routes — they exist to satisfy the different context-building
 * needs of route handlers vs. layout servers.
 */
import { json, error, isHttpError, isRedirect } from '@sveltejs/kit';
import type { Cookies, RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { z } from 'zod';
import { getApiContext } from '$lib/server/supabase';
import {
	createPermissionContextFromMembership,
	getMembershipRow,
	type MembershipRow
} from '$lib/server/permissionContext';
import { cacheRequestMembership, getOrLoadRequestMembership } from '$lib/server/membershipContextCache';
import { validateUUID } from '$lib/server/validation';
import { getRequestInfo } from '$lib/server/auditLog';
import { createSupabaseDataStore } from './supabaseDataStore';
import { createSupabaseAuthContextAdapter } from './supabaseAuthContext';
import { createSupabaseScopeEnforcementAdapter } from './supabaseScopeEnforcement';
import { createSupabaseAuditAdapter } from './supabaseAudit';
import { createSupabaseReadOnlyGuard } from './supabaseReadOnlyGuard';
import { createSupabaseSubscriptionAdapter } from './supabaseSubscription';
import { createScopedDataStore } from './scopedDataStore';
import { defaultScopeRules } from './scopeRules';
import { createSupabaseNotificationAdapter } from './supabaseNotification';
import { createStripeBillingAdapter } from './stripeBilling';
import { createSupabaseStorageAdapter } from './supabaseStorage';
import { createSupabaseCriticalTasksReadModelAdapter } from './criticalTasksReadModel';
import { createSupabaseRatingSchemePersonnelLookupPort } from './supabaseRatingSchemePersonnelLookup';
import { createSupabaseSensitiveActionAuthorizer } from '$lib/server/sensitiveActionAuthorizer';
import { resolveOrganizationRouteIdentity } from '$lib/server/core/useCases/organizationUrlSlug';
import type { UseCaseContext, AuthContext } from '$lib/server/core/ports';
import type { FeatureLanePolicyAction } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import {
	enforceLoadAuthorization,
	enforceRouteAuthorization,
	type LoadAuthorizationConfig,
	type RouteAuthorizationConfig
} from '$lib/server/core/useCases/routeAuthorization';
import { createCrudUseCases } from '$lib/server/core/useCases/crud';
import { getEntityAuditResource, type EntityDefinition } from '$lib/server/entitySchema';

interface BuildContextResult {
	ctx: UseCaseContext;
	supabase: ReturnType<typeof getApiContext>['supabase'];
}

function policyScopeGroupIds(auth: AuthContext): string[] | string | null {
	return auth.scopeSet.kind === 'groups' ? auth.scopeSet.groupIds : null;
}

async function createRequestAuthorizationPorts(config: {
	locals: App.Locals;
	supabase: ReturnType<typeof getApiContext>['supabase'];
	userId: string;
	orgId: string;
}) {
	const membership = await getOrLoadRequestMembership(config.locals, config.userId, config.orgId, () =>
		getMembershipRow(config.supabase, config.userId, config.orgId)
	);

	const permCtx = createPermissionContextFromMembership(membership);
	const auth = createSupabaseAuthContextAdapter(permCtx, config.userId, config.orgId);
	const scope = createSupabaseScopeEnforcementAdapter({
		supabase: config.supabase,
		orgId: config.orgId,
		scopeSet: permCtx.scopeSet
	});
	return { auth, scope };
}

async function buildContextInternal(event: RequestEvent): Promise<BuildContextResult> {
	const routeOrgSegment = event.params.orgId as string;
	const { supabase, userId } = getApiContext(event.locals, event.cookies, routeOrgSegment);
	const orgId = validateUUID(routeOrgSegment)
		? routeOrgSegment
		: await resolveOrganizationIdForRequest(supabase, routeOrgSegment);
	const requestInfo = getRequestInfo(event);

	const store = createSupabaseDataStore(supabase);
	const readOnlyGuard = createSupabaseReadOnlyGuard(supabase, orgId);
	const audit = createSupabaseAuditAdapter(orgId, requestInfo);

	const { auth, scope } = await createRequestAuthorizationPorts({
		locals: event.locals,
		supabase,
		userId,
		orgId
	});

	const subscription = createSupabaseSubscriptionAdapter(supabase, orgId);
	const notifications = createSupabaseNotificationAdapter();
	const billing = createStripeBillingAdapter();
	const criticalTasksReadModel = createSupabaseCriticalTasksReadModelAdapter(supabase);
	const ratingSchemePersonnelLookup = createSupabaseRatingSchemePersonnelLookupPort(supabase);
	const sensitiveActionAuthorizer = createSupabaseSensitiveActionAuthorizer({
		supabase,
		session: event.locals.session
	});
	const scopedStore = createScopedDataStore(store, policyScopeGroupIds(auth), defaultScopeRules);
	return {
		ctx: {
			store: scopedStore,
			auth,
			scope,
			audit,
			readOnlyGuard,
			subscription,
			notifications,
			billing,
			storage: createSupabaseStorageAdapter(supabase),
			sensitiveActionAuthorizer,
			criticalTasksReadModel,
			ratingSchemePersonnelLookup,
			rawStore: store
		},
		supabase
	};
}

/**
 * Provides the raw Supabase client and user info for org layout servers.
 * Org layouts need pre-auth data (org lookup, suspension check)
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
	const { supabase, userId } = getApiContext(locals, cookies, orgId);
	const canonicalOrgId = validateUUID(orgId) ? orgId : await resolveOrganizationIdForRequest(supabase, orgId);

	const store = createSupabaseDataStore(supabase);
	const readOnlyGuard = createSupabaseReadOnlyGuard(supabase, canonicalOrgId);
	const audit = { log() {} };

	const { auth, scope } = await createRequestAuthorizationPorts({
		locals,
		supabase,
		userId,
		orgId: canonicalOrgId
	});

	const subscription = createSupabaseSubscriptionAdapter(supabase, canonicalOrgId);
	const notifications = createSupabaseNotificationAdapter();
	const billing = createStripeBillingAdapter();
	const storage = createSupabaseStorageAdapter(supabase);
	const criticalTasksReadModel = createSupabaseCriticalTasksReadModelAdapter(supabase);
	const ratingSchemePersonnelLookup = createSupabaseRatingSchemePersonnelLookupPort(supabase);
	const sensitiveActionAuthorizer = createSupabaseSensitiveActionAuthorizer({
		supabase,
		session: locals.session
	});
	const scopedStore = createScopedDataStore(store, policyScopeGroupIds(auth), defaultScopeRules);
	return {
		store: scopedStore,
		auth,
		scope,
		audit,
		readOnlyGuard,
		subscription,
		notifications,
		billing,
		storage,
		sensitiveActionAuthorizer,
		criticalTasksReadModel,
		ratingSchemePersonnelLookup,
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

	const { supabase, userId } = getApiContext(locals, cookies, orgId);

	const store = createSupabaseDataStore(supabase);
	const readOnlyGuard = createSupabaseReadOnlyGuard(supabase, orgId);
	const audit = { log() {} };

	cacheRequestMembership(locals, userId, orgId, membership);
	const permCtx = createPermissionContextFromMembership(membership);
	const auth = createSupabaseAuthContextAdapter(permCtx, userId, orgId);
	const scope = createSupabaseScopeEnforcementAdapter({
		supabase,
		orgId,
		scopeSet: permCtx.scopeSet
	});

	const subscription = createSupabaseSubscriptionAdapter(supabase, orgId);
	const notifications = createSupabaseNotificationAdapter();
	const billing = createStripeBillingAdapter();
	const storage = createSupabaseStorageAdapter(supabase);
	const criticalTasksReadModel = createSupabaseCriticalTasksReadModelAdapter(supabase);
	const ratingSchemePersonnelLookup = createSupabaseRatingSchemePersonnelLookupPort(supabase);
	const sensitiveActionAuthorizer = createSupabaseSensitiveActionAuthorizer({
		supabase,
		session: locals.session
	});
	const scopedStore = createScopedDataStore(store, policyScopeGroupIds(auth), defaultScopeRules);
	return {
		store: scopedStore,
		auth,
		scope,
		audit,
		readOnlyGuard,
		subscription,
		notifications,
		billing,
		storage,
		sensitiveActionAuthorizer,
		criticalTasksReadModel,
		ratingSchemePersonnelLookup,
		rawStore: store
	};
}

async function resolveOrganizationIdForRequest(
	supabase: ReturnType<typeof getApiContext>['supabase'],
	segment: string
): Promise<string> {
	if (validateUUID(segment)) {
		return segment;
	}

	const identity = await resolveOrganizationRouteIdentity(supabase, segment);
	if (!identity) {
		throw error(404, 'Organization not found');
	}

	return identity.id;
}

export function rethrowOrWrap(err: unknown): never {
	if (isHttpError(err) || isRedirect(err)) {
		throw err;
	}

	if (err && typeof err === 'object' && 'status' in err) {
		const { status } = err as { status?: unknown };
		if (typeof status === 'number' && status >= 400 && status <= 599) {
			const message = err instanceof Error ? err.message : 'Request failed';
			throw error(status, message);
		}
	}
	console.error('[http-adapter] Unhandled route error:', err);
	throw error(500, 'Internal server error');
}

async function withHttpErrorBoundary<T>(operation: Promise<T>): Promise<T> {
	try {
		return await operation;
	} catch (err) {
		rethrowOrWrap(err);
	}
}

async function withHttpStatusErrorBoundary<T>(operation: Promise<T>): Promise<T> {
	try {
		return await operation;
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			rethrowOrWrap(err);
		}
		throw err;
	}
}

// ---------------------------------------------------------------------------
// handle() — unified route wrapper
// ---------------------------------------------------------------------------

type RouteConfigAuthorization = RouteAuthorizationConfig;

type RouteConfigBehavior<TInput, TOutput> = {
	input?: z.ZodType<TInput>;
	parseInput?: (event: RequestEvent) => TInput | Promise<TInput>;
	fn: (ctx: UseCaseContext, input: TInput) => Promise<TOutput>;
	formatOutput?: (result: TOutput) => Response;
	audit?: {
		action: string;
		resourceType: string;
		resourceId?: (result: TOutput) => string;
	};
};

export type RouteConfig<TInput = void, TOutput = unknown> = RouteConfigAuthorization &
	RouteConfigBehavior<TInput, TOutput>;

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
	await enforceRouteAuthorization(ctx, config as RouteConfig<unknown, unknown>);

	// 2. Zod input validation
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

	// 3. Execute use case
	const output = await config.fn(ctx, input);

	// 4. Declarative audit
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

type LoadConfig<T> = LoadAuthorizationConfig & {
	fn: (ctx: UseCaseContext) => Promise<T>;
	defer?: boolean;
};

function enforceLoadPermission(ctx: UseCaseContext, config: LoadConfig<unknown>): void | Promise<void> {
	return enforceLoadAuthorization(ctx, config);
}

/**
 * Testable core of loadWithContext() — no SvelteKit dependency.
 *
 * Without `defer`: checks permissions and awaits the data (blocks navigation).
 * With `defer: true`: starts the policy check immediately and returns data as an
 * unresolved promise for SvelteKit streaming. Denied access rejects that promise.
 */
export function loadWithContextCore<T>(
	ctx: UseCaseContext,
	config: LoadConfig<T> & { defer: true }
): { data: Promise<T> };
export function loadWithContextCore<T>(ctx: UseCaseContext, config: LoadConfig<T>): Promise<T>;
export function loadWithContextCore<T>(ctx: UseCaseContext, config: LoadConfig<T>): Promise<T> | { data: Promise<T> } {
	if (config.defer) {
		const permissionResult = enforceLoadPermission(ctx, config as LoadConfig<unknown>);
		return {
			data: withHttpStatusErrorBoundary(Promise.resolve(permissionResult).then(() => config.fn(ctx)))
		};
	}

	return withHttpStatusErrorBoundary(
		Promise.resolve(enforceLoadPermission(ctx, config as LoadConfig<unknown>)).then(() => config.fn(ctx))
	);
}

/**
 * Page loader wrapper with mandatory permission declaration.
 * Wraps buildLayoutContext() for use in +page.server.ts / +layout.server.ts load functions.
 *
 * Without `defer`: awaits data before returning (standard blocking load).
 * With `defer: true`: policy checks start immediately, data is returned as an
 * unresolved promise that SvelteKit streams, and denied access rejects that promise.
 * Pages with skeleton UIs should use this to allow instant navigation.
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
	return withHttpErrorBoundary(
		(async () => {
			const ctx = await buildLayoutContext(locals, cookies, orgId);
			return loadWithContextCore(ctx, config);
		})()
	);
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
	policyAction?: FeatureLanePolicyAction;
	beforeDelete?: (ctx: UseCaseContext, id: string) => Promise<void>;
	afterDelete?: (ctx: UseCaseContext, id: string) => Promise<void>;
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
	const policyAction = hooks?.policyAction ?? entity.policyAction;
	if (!policyAction) {
		throw new Error(`entityHandlers: entity "${entity.table}" must define policyAction`);
	}

	const config = {
		entity,
		auditResource: getEntityAuditResource(entity),
		policyAction,
		beforeDelete: hooks?.beforeDelete
			? async (ctx: UseCaseContext, id: string) => hooks.beforeDelete!(ctx, id)
			: undefined,
		afterDelete: hooks?.afterDelete ? async (ctx: UseCaseContext, id: string) => hooks.afterDelete!(ctx, id) : undefined
	};

	const useCases = createCrudUseCases(config);
	const methods = new Set(entity.methods);
	const result: EntityHandlersResult = { _configs: {} };

	if (methods.has('POST')) {
		const postConfig: RouteConfig<Record<string, unknown>, unknown> = {
			mutation: true,
			policyAction,
			policyResource: { kind: 'unscoped' },
			fn: (ctx, input) => useCases.create(ctx, input)
		};
		result.POST = handle(postConfig);
		result._configs.POST = postConfig;
	}

	if (methods.has('PUT')) {
		const putConfig: RouteConfig<Record<string, unknown>, unknown> = {
			mutation: true,
			policyAction,
			policyResource: { kind: 'unscoped' },
			fn: (ctx, input) => useCases.update(ctx, input)
		};
		result.PUT = handle(putConfig);
		result._configs.PUT = putConfig;
	}

	if (methods.has('DELETE')) {
		const deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
			mutation: true,
			policyAction,
			policyResource: { kind: 'unscoped' },
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
