import {
	createSupabaseDeletionRequestCancellation,
	createSupabaseDeletionRequestStore
} from '$features/deletion-requests/index.server';
import {
	createFeedbackSubmission,
	createGitHubFeedbackMirror,
	createSupabaseFeedbackSubmissionStore
} from '$features/feedback/index.server';
import { createSupabaseAccountAnnouncementDismissals } from '$features/notifications/index.server';
import { createSupabaseFeedbackOrganizationContextPort } from '$features/organization/index.server';
import {
	enforceLoadAuthorization,
	enforceRouteAuthorization,
	type LoadAuthorizationConfig,
	type RouteAuthorizationConfig
} from '$lib/access/index.server';
import { fail } from '$lib/errors';
import { getAdminClient } from '$lib/server/supabase';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';
import type { Cookies, RequestEvent, RequestHandler } from '@sveltejs/kit';
import { error, isHttpError, isRedirect, json } from '@sveltejs/kit';
import type { z } from 'zod';
import {
	buildLayoutRequest,
	buildRouteRequest,
	getAdmittedRequestClient,
	type AdmittedOrganizationRequest,
	type RequestContextBuilder
} from './requestContexts.server';

/** Construct Feedback collaborators only after the route admits the account. */
export function createRequestFeedbackSubmission() {
	const context = createSupabaseFeedbackOrganizationContextPort(getAdminClient);
	return createFeedbackSubmission({
		store: createSupabaseFeedbackSubmissionStore(getAdminClient),
		resolveOrganizationContext: (input) => context.resolveOrganizationContext(input),
		mirror: createGitHubFeedbackMirror()
	});
}

/** Bind Identity's personal preferences to the admitted ordinary request client. */
export function createRequestAccountPreferencesProvider(locals: App.Locals) {
	const { supabase } = getAdmittedRequestClient(locals);
	return { supabase };
}

export function createRequestAccountAnnouncementDismissals(locals: Pick<App.Locals, 'supabase'>, userId: string) {
	return createSupabaseAccountAnnouncementDismissals(locals.supabase, userId);
}

/** Bind only the ordinary authenticated request client to the owned workflow. */
export function createRequestDeletionRequestStore(locals: Pick<App.Locals, 'supabase'>) {
	return createSupabaseDeletionRequestStore(locals.supabase);
}

export function createRequestDeletionRequestCancellation(locals: Pick<App.Locals, 'supabase'>) {
	return createSupabaseDeletionRequestCancellation(locals.supabase);
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
	console.error('[http-adapter] Unhandled route error:', sanitizeErrorForLog(err));
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

type PolicyRequest = Pick<AdmittedOrganizationRequest, 'auth' | 'audit'>;

type RouteBehavior<TInput, TOutput, TContext> = {
	input?: z.ZodType<TInput>;
	parseInput?: (event: RequestEvent) => TInput | Promise<TInput>;
	fn: (context: TContext, input: TInput) => Promise<TOutput>;
	formatOutput?: (result: TOutput) => Response;
	audit?: {
		action: string;
		resourceType: string;
		resourceId?: (result: TOutput) => string;
	};
};

type RouteOperationConfig<TInput, TOutput, TContext> = RouteAuthorizationConfig &
	RouteBehavior<TInput, TOutput, TContext>;

export type RouteConfig<TInput = void, TOutput = unknown, TContext = unknown> = RouteOperationConfig<
	TInput,
	TOutput,
	TContext
> & { context: RequestContextBuilder<TContext> };

export async function handleUseCaseRequest<TInput, TOutput, TContext>(
	config: RouteOperationConfig<TInput, TOutput, TContext>,
	request: PolicyRequest,
	rawInput: unknown,
	selectContext: () => TContext
): Promise<TOutput> {
	await enforceRouteAuthorization(request, config);
	let input: TInput;
	if (config.input) {
		const result = config.input.safeParse(rawInput);
		if (!result.success) fail(400, result.error.issues.map((issue) => issue.message).join('; '));
		input = result.data;
	} else {
		input = rawInput as TInput;
	}
	const output = await config.fn(selectContext(), input);
	if (config.audit) {
		request.audit.log({
			action: config.audit.action,
			resourceType: config.audit.resourceType,
			resourceId: config.audit.resourceId?.(output)
		});
	}
	return output;
}

type LoadOperationConfig<T, TContext> = LoadAuthorizationConfig & {
	fn: (context: TContext) => Promise<T>;
	defer?: boolean;
};
type LoadConfig<T, TContext> = LoadOperationConfig<T, TContext> & {
	context: RequestContextBuilder<TContext>;
};

export function loadWithContextCore<T, TContext>(
	request: PolicyRequest,
	config: LoadOperationConfig<T, TContext> & { defer: true },
	selectContext: () => TContext
): { data: Promise<T> };
export function loadWithContextCore<T, TContext>(
	request: PolicyRequest,
	config: LoadOperationConfig<T, TContext>,
	selectContext: () => TContext
): Promise<T>;
export function loadWithContextCore<T, TContext>(
	request: PolicyRequest,
	config: LoadOperationConfig<T, TContext>,
	selectContext: () => TContext
): Promise<T> | { data: Promise<T> } {
	const data = withHttpStatusErrorBoundary(
		Promise.resolve(enforceLoadAuthorization(request, config)).then(() => config.fn(selectContext()))
	);
	return config.defer ? { data } : data;
}

export function loadWithDeferredContext<T, TContext, TRequest extends PolicyRequest>(
	request: Promise<TRequest>,
	config: LoadOperationConfig<T, TContext> & { defer: true },
	selectContext: (request: TRequest) => TContext
): { data: Promise<T> } {
	return {
		data: withHttpErrorBoundary(
			request.then((admitted) => loadWithContextCore(admitted, config, () => selectContext(admitted)).data)
		)
	};
}

export async function loadWithContext<T, TContext>(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string,
	config: LoadConfig<T, TContext> & { defer: true }
): Promise<{ data: Promise<T> }>;
export async function loadWithContext<T, TContext>(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string,
	config: LoadConfig<T, TContext>
): Promise<T>;
export async function loadWithContext<T, TContext>(
	locals: App.Locals,
	_cookies: Cookies,
	orgId: string,
	config: LoadConfig<T, TContext>
): Promise<T | { data: Promise<T> }> {
	const request = buildLayoutRequest(locals, orgId);
	if (config.defer) return loadWithDeferredContext(request, { ...config, defer: true }, config.context);
	return withHttpErrorBoundary(
		request.then((admitted) => loadWithContextCore(admitted, config, () => config.context(admitted)))
	);
}

export function handle<TInput, TOutput, TContext>(config: RouteConfig<TInput, TOutput, TContext>): RequestHandler {
	return async (event) => {
		try {
			const request = await buildRouteRequest(event);
			let rawInput: unknown;
			if (config.parseInput) rawInput = await config.parseInput(event);
			else if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
				try {
					rawInput = await event.request.json();
				} catch {
					throw error(400, 'Invalid JSON in request body');
				}
			}
			const result = await handleUseCaseRequest(config, request, rawInput, () => config.context(request));
			return config.formatOutput ? config.formatOutput(result) : json(result);
		} catch (err) {
			rethrowOrWrap(err);
		}
	};
}
