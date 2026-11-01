import type { RequestEvent } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import {
	captureFailure,
	classifyFailure,
	createSupabaseErrorRecordingStore,
	noteServerFailure,
	recordingAfterResponse,
	runInErrorScope,
	type CaptureConfig
} from '$features/error-reporting/index.server';
import { ERROR_REFERENCE_HEADER } from '$lib/errors';
import { getAdminClient } from '$lib/server/supabase';

type CaptureEvent = Pick<RequestEvent, 'locals' | 'params' | 'route' | 'request'>;

/**
 * Attribution comes from what the request proved: the admitted actor, the route's id (never its URL) and an
 * Organization only when this request admitted one. Each is read when the failure is noted, not when the scope opens.
 */
export function captureConfigFor(event: CaptureEvent): CaptureConfig {
	return {
		record: (occurrence) => createSupabaseErrorRecordingStore(getAdminClient).record(occurrence),
		routeId: event.route?.id ?? null,
		method: event.request.method,
		userId: () => event.locals.actor?.userId ?? null,
		organizationId: async () => {
			const segment = event.params?.orgId;
			const admission = segment ? event.locals.organizationAdmissions?.get(segment) : undefined;
			return admission ? (await admission).id : null;
		}
	};
}

/** A report that cannot be stored must not try to store itself. */
function isReportingEndpoint(event: Pick<RequestEvent, 'route'>): boolean {
	return event.route?.id?.endsWith('/api/errors') ?? false;
}

function withReference(response: Response, reference: string): Response {
	try {
		response.headers.set(ERROR_REFERENCE_HEADER, reference);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		copy.headers.set(ERROR_REFERENCE_HEADER, reference);
		return copy;
	}
}

/**
 * Runs outside the app's own `handle`, so it sees every failure noted while a request resolves and the final status.
 * A 5xx nothing noted (a route that returned `json(..., { status: 500 })`) is noted here as a generic response.
 */
export const captureHandle: Handle = async ({ event, resolve }) => {
	const { result: response, reference } = await runInErrorScope(captureConfigFor(event), async (scope) => {
		const response = await resolve(event);
		if (
			!isReportingEndpoint(event) &&
			scope.noted() === 0 &&
			classifyFailure({ source: 'server', status: response.status, unknownException: false })
		) {
			scope.note({
				failure: {
					name: 'ServerResponse',
					code: String(response.status),
					message: 'The server responded with an error'
				},
				kind: 'server_response',
				status: response.status
			});
		}
		return response;
	});
	return reference ? withReference(response, reference) : response;
};

/** Same stack output as SvelteKit's own default for an unknown error, which this hook replaces. */
function logUnknownError(error: unknown) {
	let cause = error;
	while (cause instanceof Error) {
		if (cause.stack) console.error(cause.stack);
		cause = cause.cause;
	}
	if (cause) console.error(String(cause));
}

/**
 * Records the errors SvelteKit catches: unknown exceptions and `error(5xx)`. An error `rethrowOrWrap` already noted
 * carries its reference, so one failure is one occurrence. Stays synchronous while the request scope is open, because
 * SvelteKit discards an async result when the error came from server rendering.
 */
export const handleServerError: HandleServerError = (input) => {
	if (input.kind === 'validation' || isReportingEndpoint(input.event)) return;
	if (input.kind === 'unknown') logUnknownError(input.error);
	const status = input.kind === 'unknown' ? 500 : input.error.status;
	const kind = classifyFailure({ source: 'server', status, unknownException: input.kind === 'unknown' });
	if (!kind) return;

	if (input.kind === 'app' && input.error.errorReference) {
		const reference = input.error.errorReference;
		const pending = recordingAfterResponse(reference);
		return pending ? pending.then(() => ({ errorReference: reference })) : { errorReference: reference };
	}

	const failure =
		input.kind === 'unknown' ? input.error : { name: 'HttpError', code: String(status), message: input.error.message };
	const reference = noteServerFailure({ failure, kind, status });
	if (reference) {
		const pending = recordingAfterResponse(reference);
		return pending ? pending.then(() => ({ errorReference: reference })) : { errorReference: reference };
	}

	const outside = captureFailure(captureConfigFor(input.event), { failure, origin: 'server', kind, status });
	return outside.recorded.then(() => ({ errorReference: outside.reference }));
};
