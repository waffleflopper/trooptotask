import {
	createSupabaseDeletionRequestCancellation,
	createSupabaseDeletionRequestStore,
	createSupabaseDeletionRequestSubmission
} from '$features/deletion-requests/index.server';
import { createFeedbackSubmission, createSupabaseFeedbackSubmissionStore } from '$features/feedback/index.server';
import { createSupabaseAccountAnnouncementDismissals } from '$features/notifications/index.server';
import { createSupabaseFeedbackOrganizationContextPort } from '$features/organization/index.server';
import {
	enforceLoadAuthorization,
	enforceRouteAuthorization,
	type LoadAuthorizationConfig,
	type RouteAuthorizationConfig
} from '$lib/access/index.server';
import { FEATURE_KEYS, FEATURE_SWITCHES, featureOffMessage } from '$lib/access/featureSwitches';
import { fail, RequestFailure, type RequestFailureDetails } from '$lib/errors';
import { getAdminClient } from '$lib/server/supabase';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';
import type { Cookies, RequestEvent, RequestHandler } from '@sveltejs/kit';
import { fail as actionFailure, error, isHttpError, isRedirect, json } from '@sveltejs/kit';
import type { z } from 'zod';
import {
	buildLayoutRequest,
	buildRouteRequest,
	getAdmittedRequestClient,
	type AdmittedOrganizationRequest,
	type RequestContextBuilder
} from './requestContexts.server';
import { keepStreamedRejectionObserved } from './streamedWorkspace';
import { issueMessage } from '$lib/utils/inputSchemas';

/** Construct Feedback collaborators only after the route admits the account. */
export function createRequestFeedbackSubmission() {
	const context = createSupabaseFeedbackOrganizationContextPort(getAdminClient);
	return createFeedbackSubmission({
		store: createSupabaseFeedbackSubmissionStore(getAdminClient),
		resolveOrganizationContext: (input) => context.resolveOrganizationContext(input)
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

/** Client roles cannot insert requests; creation runs after the owning feature describes the target. */
export function createRequestDeletionRequestSubmission() {
	return createSupabaseDeletionRequestSubmission(getAdminClient);
}

export function createRequestDeletionRequestCancellation(locals: Pick<App.Locals, 'supabase'>) {
	return createSupabaseDeletionRequestCancellation(locals.supabase);
}

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

/** Only an app-created 4xx carries its message to the client; anything else is logged and generic. */
function toPublicFailure(err: unknown): { status: number; message: string; details: RequestFailureDetails } {
	if (err instanceof RequestFailure && err.status >= 400 && err.status <= 499) {
		const { reason, requiresStepUp, stepUpPath } = err;
		return { status: err.status, message: err.message, details: { reason, requiresStepUp, stepUpPath } };
	}
	console.error('[http-adapter] Unhandled route error:', sanitizeErrorForLog(err));
	if (err instanceof RequestFailure && err.status >= 500 && err.status <= 599) {
		return { status: err.status, message: err.publicMessage ? err.message : INTERNAL_ERROR_MESSAGE, details: {} };
	}
	return { status: 500, message: INTERNAL_ERROR_MESSAGE, details: {} };
}

export function rethrowOrWrap(err: unknown): never {
	if (isHttpError(err) || isRedirect(err)) throw err;
	const failure = toPublicFailure(err);
	throw error(failure.status, failure.message);
}

export function toActionFailure(errorKey: string, err: unknown) {
	if (isHttpError(err) || isRedirect(err)) throw err;
	const { status, message, details } = toPublicFailure(err);
	const data: Record<string, unknown> = { [errorKey]: message };
	if (details.reason !== undefined) data.reason = details.reason;
	if (details.requiresStepUp !== undefined) data.requiresStepUp = details.requiresStepUp;
	if (typeof details.stepUpPath === 'string') data.stepUpPath = details.stepUpPath;
	return actionFailure(status, data);
}

async function withHttpErrorBoundary<T>(operation: Promise<T>): Promise<T> {
	try {
		return await operation;
	} catch (err) {
		rethrowOrWrap(err);
	}
}

async function withRequestFailureBoundary<T>(operation: Promise<T>): Promise<T> {
	try {
		return await operation;
	} catch (err) {
		if (err instanceof RequestFailure) rethrowOrWrap(err);
		throw err;
	}
}

type PolicyRequest = Pick<AdmittedOrganizationRequest, 'auth' | 'audit' | 'disabledFeatures'>;

function disabledPolicyFeature(request: PolicyRequest, config: LoadAuthorizationConfig) {
	const action = config.policyAction;
	if (action.owner.kind !== 'feature-lane') return undefined;
	const { lane } = action.owner;
	const laneFeature = FEATURE_KEYS.find((key) => FEATURE_SWITCHES[key].lane === lane);
	const feature = 'feature' in action ? action.feature : undefined;
	return [laneFeature, feature].find((key) => key && request.disabledFeatures.includes(key));
}

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
	const feature = disabledPolicyFeature(request, config);
	if (feature) fail(403, featureOffMessage(feature));
	await enforceRouteAuthorization(request, config);
	let input: TInput;
	if (config.input) {
		const result = config.input.safeParse(rawInput);
		if (!result.success) fail(400, issueMessage(result.error));
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
	const feature = disabledPolicyFeature(request, config);
	if (feature) error(403, { message: featureOffMessage(feature), featureOff: feature });
	const data = withRequestFailureBoundary(
		Promise.resolve().then(async () => {
			await enforceLoadAuthorization(request, config);
			return config.fn(selectContext());
		})
	);
	return config.defer ? { data: keepStreamedRejectionObserved(data) } : data;
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
	return withHttpErrorBoundary(
		(async () => {
			const request = await buildLayoutRequest(locals, orgId);
			if (config.defer) {
				const { data } = loadWithContextCore(request, { ...config, defer: true }, () => config.context(request));
				return { data: keepStreamedRejectionObserved(withHttpErrorBoundary(data)) };
			}
			return loadWithContextCore(request, config, () => config.context(request));
		})()
	);
}

/** Read a JSON object request body, failing 400 for malformed JSON or a non-object body. */
export async function readJsonBody(event: Pick<RequestEvent, 'request'>): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		fail(400, 'Invalid JSON in request body');
	}
	if (body === null || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Request body must be a JSON object');
	return body as Record<string, unknown>;
}

/** Read a multipart or urlencoded request body, failing 400 for any other payload. */
export async function readFormData(event: Pick<RequestEvent, 'request'>): Promise<FormData> {
	try {
		return await event.request.formData();
	} catch {
		fail(400, 'Request body must be form data');
	}
}

function readDefaultInput(event: RequestEvent): Promise<unknown> | undefined {
	if (event.request.method === 'GET' || event.request.method === 'HEAD') return undefined;
	return readJsonBody(event);
}

export const PRIVATE_RESPONSE_HEADERS = {
	'Cache-Control': 'private, no-store',
	Vary: 'Cookie'
} as const;

/** A per-user JSON read that neither the browser nor an intermediary may store. */
export function privateJson(result: unknown): Response {
	return json(result, { headers: PRIVATE_RESPONSE_HEADERS });
}

export function handle<TInput, TOutput, TContext>(config: RouteConfig<TInput, TOutput, TContext>): RequestHandler {
	return async (event) => {
		try {
			const request = await buildRouteRequest(event);
			const rawInput = config.parseInput ? await config.parseInput(event) : await readDefaultInput(event);
			const result = await handleUseCaseRequest(config, request, rawInput, () => config.context(request));
			return config.formatOutput ? config.formatOutput(result) : json(result);
		} catch (err) {
			rethrowOrWrap(err);
		}
	};
}
