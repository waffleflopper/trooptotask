import { recordErrorReference, type PendingErrorReference } from '$lib/stores/errorReportLedger';
import {
	ERROR_REFERENCE_HEADER,
	classifyFailure,
	isRouteId,
	sanitizeFailureForCapture,
	type ClientReportKind
} from './contracts';

/** The same failure inside this window is reported once, so a retry loop or a re-render does not flood the page. */
export const DUPLICATE_WINDOW_MS = 60_000;
export const MAX_REPORTS_PER_PAGE = 20;

const ORG_PATH = /^\/org\/([^/]+)(?:\/|$)/;
const REPORT_PATH = /^(?:\/org\/[^/]+)?\/api\/errors$/;

export interface ClientFailure {
	failure: unknown;
	kind: ClientReportKind;
	method?: string | null;
	status?: number | null;
}

export interface ClientErrorReporter {
	/**
	 * Send one failure. Returns its reference, which settles once the server stored it, or null when the page already
	 * reported too many or there is no route to attribute it to.
	 */
	report(input: ClientFailure): PendingErrorReference | null;
}

interface ReporterEnvironment {
	/** Not the instrumented fetch: a report must not report its own failure. */
	fetch: typeof fetch;
	now(): number;
	pathname(): string;
	routeId(): string | null;
}

export function orgSegmentOf(pathname: string): string | null {
	return ORG_PATH.exec(pathname)?.[1] ?? null;
}

export function createClientErrorReporter(env: ReporterEnvironment): ClientErrorReporter {
	const recent = new Map<string, { at: number; reference: PendingErrorReference }>();
	let sent = 0;

	return {
		report({ failure, kind, method = null, status = null }) {
			const captured = sanitizeFailureForCapture(failure);
			const routeId = env.routeId();
			const key = `${kind}\n${routeId ?? ''}\n${captured.name}\n${captured.message}`;
			const now = env.now();

			const earlier = recent.get(key);
			if (earlier && now - earlier.at < DUPLICATE_WINDOW_MS) return earlier.reference;
			if (sent >= MAX_REPORTS_PER_PAGE) return null;
			sent += 1;

			const org = orgSegmentOf(env.pathname());
			const reference = send(env.fetch, org ? `/org/${encodeURIComponent(org)}/api/errors` : '/api/errors', {
				kind,
				routeId: routeId && isRouteId(routeId) ? routeId : null,
				name: captured.name,
				message: captured.message,
				method: method ?? null,
				status
			});
			recent.set(key, { at: now, reference });
			return reference;
		}
	};
}

async function send(fetchImpl: typeof fetch, url: string, body: Record<string, unknown>): Promise<string | null> {
	try {
		const res = await fetchImpl(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) return null;
		const data: unknown = await res.json();
		const reference = (data as { reference?: unknown } | null)?.reference;
		return typeof reference === 'string' ? reference : null;
	} catch {
		return null;
	}
}

function isAbort(reason: unknown): boolean {
	return reason instanceof DOMException && reason.name === 'AbortError';
}

interface FetchTarget {
	url: URL;
	method: string;
}

function targetOf(input: RequestInfo | URL, init: RequestInit | undefined, base: string): FetchTarget | null {
	try {
		const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
		return { url: new URL(raw, base), method };
	} catch {
		return null;
	}
}

type CaptureWindow = EventTarget & {
	location: Pick<Location, 'href' | 'origin' | 'pathname'>;
	fetch: typeof fetch;
};

/**
 * Watch this page for failures a person cannot see the cause of. A response that carries a reference was already
 * stored by the server, so the page only remembers it for the failure toast. A request that never got an answer, a
 * script error and an unhandled rejection are reported by the browser. Returns the function that undoes it.
 */
export function installClientErrorCapture(
	win: CaptureWindow,
	options: { routeId(): string | null; now?: () => number; ignoreRejection?(reason: unknown): boolean }
): { reporter: ClientErrorReporter; reportFailure(failure: unknown): void; uninstall(): void } {
	const now = options.now ?? Date.now;
	const nativeFetch = win.fetch.bind(win);
	const reporter = createClientErrorReporter({
		fetch: nativeFetch,
		now,
		pathname: () => win.location.pathname,
		routeId: options.routeId
	});
	let leaving = false;
	const onLeaving = () => {
		leaving = true;
	};
	const onReturning = () => {
		leaving = false;
	};

	function note(input: ClientFailure) {
		const reference = reporter.report(input);
		if (reference) recordErrorReference(reference, orgSegmentOf(win.location.pathname), now());
	}

	const instrumentedFetch: typeof fetch = async (input, init) => {
		const target = targetOf(input, init, win.location.href);
		if (!target || target.url.origin !== win.location.origin || REPORT_PATH.test(target.url.pathname)) {
			return nativeFetch(input, init);
		}
		const org = orgSegmentOf(win.location.pathname);
		const method = target.method;
		let response: Response;
		try {
			response = await nativeFetch(input, init);
		} catch (thrown) {
			const aborted = isAbort(thrown) || init?.signal?.aborted || (input instanceof Request && input.signal.aborted);
			const kind = classifyFailure({ source: 'fetch-rejection', method });
			if (!aborted && !leaving && kind && (kind === 'transport' || kind === 'unconfirmed_write')) {
				note({ failure: thrown, kind, method });
			}
			throw thrown;
		}
		if (response.status >= 500) {
			const reference = response.headers.get(ERROR_REFERENCE_HEADER);
			if (reference) recordErrorReference(reference, org, now());
			else if (!leaving) {
				const kind = classifyFailure({ source: 'fetch-rejection', method });
				if (kind === 'transport' || kind === 'unconfirmed_write') {
					note({
						failure: { name: 'HttpError', message: `The server did not confirm the request (${response.status})` },
						kind,
						method,
						status: response.status
					});
				}
			}
		}
		return response;
	};

	const onError = (rawEvent: Event) => {
		const event = rawEvent as ErrorEvent;
		if (leaving || event.target !== win || !event.error) return;
		if (event.filename && new URL(event.filename, win.location.href).origin !== win.location.origin) return;
		const kind = classifyFailure({ source: 'window-error' });
		if (kind === 'render') note({ failure: event.error, kind });
	};
	const onRejection = (rawEvent: Event) => {
		const reason = (rawEvent as PromiseRejectionEvent).reason;
		if (leaving || isAbort(reason) || options.ignoreRejection?.(reason)) return;
		if (!(reason instanceof Error)) return;
		const kind = classifyFailure({ source: 'window-error' });
		if (kind === 'render') note({ failure: reason, kind });
	};

	win.fetch = instrumentedFetch;
	win.addEventListener('pagehide', onLeaving);
	win.addEventListener('beforeunload', onLeaving);
	win.addEventListener('pageshow', onReturning);
	win.addEventListener('error', onError);
	win.addEventListener('unhandledrejection', onRejection);
	return {
		reporter,
		reportFailure: (failure) => note({ failure, kind: 'render' }),
		uninstall() {
			if (win.fetch === instrumentedFetch) win.fetch = nativeFetch;
			win.removeEventListener('pagehide', onLeaving);
			win.removeEventListener('beforeunload', onLeaving);
			win.removeEventListener('pageshow', onReturning);
			win.removeEventListener('error', onError);
			win.removeEventListener('unhandledrejection', onRejection);
		}
	};
}
