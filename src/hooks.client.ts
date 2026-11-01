import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { page } from '$app/state';
import { classifyFailure, installClientErrorCapture } from '$features/error-reporting';
import { StoreRequestError } from '$lib/stores/core/ports';
import { setClientFailureSink } from '$lib/stores/errorReportLedger';

let capture: ReturnType<typeof installClientErrorCapture> | null = null;

export const init: ClientInit = () => {
	capture?.uninstall();
	capture = installClientErrorCapture(window, {
		routeId: () => page.route.id,
		ignoreRejection: (reason) => reason instanceof StoreRequestError
	});
	setClientFailureSink(capture.reportFailure);
};

/** Stays synchronous: a report is sent in the background and never changes what the person sees. */
export const handleError: HandleClientError = (input) => {
	if (input.kind === 'unknown') console.error(input.error);
	// The server already stored an error it named; reporting it again would count one failure twice.
	if (input.kind === 'app' && input.error.errorReference) return;
	const status = input.kind === 'unknown' ? 500 : (input.error.status ?? 500);
	const kind = classifyFailure({ source: 'client-navigation', caught: input.kind, status });
	if (kind !== 'render' && kind !== 'server_exception') return;
	capture?.reporter.report({
		failure: input.kind === 'unknown' ? input.error : { name: 'HttpError', message: input.error.message },
		kind,
		status: input.kind === 'unknown' ? null : status
	});
};
