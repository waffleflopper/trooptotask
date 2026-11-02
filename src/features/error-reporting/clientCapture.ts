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
/** A stalled report must not hold the person's Feedback open; it is treated as not sent. */
export const REPORT_DEADLINE_MS = 5000;

const ORG_PATH = /^\/org\/([^/]+)(?:\/|$)/;
const REPORT_PATH = /^(?:\/org\/[^/]+)?\/api\/errors$/;

export interface ClientFailure {
	failure: unknown;
	kind: ClientReportKind;
	method?: string | null;
	status?: number | null;
}

/** Where a failure happened, read before any await so a later navigation cannot change who it belongs to. */
export interface FailureContext {
	org: string | null;
	routeId: string | null;
}

export interface ClientErrorReporter {
	/**
	 * Send one failure. Returns its reference, which settles once the server stored it, or null when the page already
	 * reported too many or there is no route to attribute it to.
	 */
	report(input: ClientFailure, context: FailureContext): PendingErrorReference | null;
	/** Send again the reports the network refused, once the browser is back online. */
	resendUnsent(): void;
}

interface ReporterEnvironment {
	/** Not the instrumented fetch: a report must not report its own failure. */
	fetch: typeof fetch;
	now(): number;
}

export function orgSegmentOf(pathname: string): string | null {
	return ORG_PATH.exec(pathname)?.[1] ?? null;
}

export function createClientErrorReporter(env: ReporterEnvironment): ClientErrorReporter {
	const recent = new Map<string, { at: number; reference: PendingErrorReference }>();
	let sent = 0;
	let unsent: UnsentReport[] = [];
	const keep = (report: UnsentReport) => {
		if (unsent.length < MAX_REPORTS_PER_PAGE) unsent.push(report);
	};

	return {
		resendUnsent() {
			const waiting = unsent;
			unsent = [];
			for (const report of waiting) void send(env.fetch, report, keep);
		},
		report({ failure, kind, method = null, status = null }, { org, routeId }) {
			const captured = sanitizeFailureForCapture(failure);
			const key = `${org ?? ''}\n${kind}\n${routeId ?? ''}\n${captured.name}\n${captured.message}`;
			const now = env.now();

			const earlier = recent.get(key);
			if (earlier && now - earlier.at < DUPLICATE_WINDOW_MS) return earlier.reference;
			if (sent >= MAX_REPORTS_PER_PAGE) return null;
			sent += 1;

			const reference = send(
				env.fetch,
				{
					url: org ? `/org/${encodeURIComponent(org)}/api/errors` : '/api/errors',
					body: JSON.stringify({
						kind,
						routeId: routeId && isRouteId(routeId) ? routeId : null,
						name: captured.name,
						message: captured.message,
						method: method ?? null,
						status
					})
				},
				keep
			);
			recent.set(key, { at: now, reference });
			return reference;
		}
	};
}

interface UnsentReport {
	url: string;
	body: string;
}

async function send(
	fetchImpl: typeof fetch,
	report: UnsentReport,
	keepUnsent: (report: UnsentReport) => void
): Promise<string | null> {
	let res: Response;
	try {
		res = await fetchImpl(report.url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: report.body,
			signal: AbortSignal.timeout(REPORT_DEADLINE_MS)
		});
	} catch {
		keepUnsent(report);
		return null;
	}
	if (!res.ok) return null;
	try {
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
): {
	report(input: ClientFailure, context?: FailureContext): void;
	reportFailure(failure: unknown): void;
	uninstall(): void;
} {
	const now = options.now ?? Date.now;
	const nativeFetch = win.fetch.bind(win);
	const reporter = createClientErrorReporter({
		fetch: nativeFetch,
		now
	});
	const currentContext = (): FailureContext => ({
		org: orgSegmentOf(win.location.pathname),
		routeId: options.routeId()
	});
	const resendUnsent = () => reporter.resendUnsent();
	let leaving = false;
	const onLeaving = () => {
		leaving = true;
	};
	const onReturning = () => {
		leaving = false;
	};

	function note(input: ClientFailure, context = currentContext()) {
		const reference = reporter.report(input, context);
		if (reference) recordErrorReference(reference, context.org, now());
	}

	const instrumentedFetch: typeof fetch = async (input, init) => {
		const target = targetOf(input, init, win.location.href);
		if (!target || target.url.origin !== win.location.origin || REPORT_PATH.test(target.url.pathname)) {
			return nativeFetch(input, init);
		}
		const context = currentContext();
		const method = target.method;
		let response: Response;
		try {
			response = await nativeFetch(input, init);
		} catch (thrown) {
			const aborted = isAbort(thrown) || init?.signal?.aborted || (input instanceof Request && input.signal.aborted);
			const kind = classifyFailure({ source: 'fetch-rejection', method });
			if (!aborted && !leaving && kind && (kind === 'transport' || kind === 'unconfirmed_write')) {
				note({ failure: thrown, kind, method }, context);
			}
			throw thrown;
		}
		// A failed form action answers HTTP 200 with its status in the body, so the header decides, not the status.
		const reference = response.headers.get(ERROR_REFERENCE_HEADER);
		if (reference) recordErrorReference(reference, context.org, now());
		else if (response.status >= 500) {
			if (!leaving) {
				const kind = classifyFailure({ source: 'fetch-rejection', method });
				if (kind === 'transport' || kind === 'unconfirmed_write') {
					note(
						{
							failure: { name: 'HttpError', message: `The server did not confirm the request (${response.status})` },
							kind,
							method,
							status: response.status
						},
						context
					);
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
	win.addEventListener('online', resendUnsent);
	win.addEventListener('pagehide', onLeaving);
	win.addEventListener('pageshow', onReturning);
	win.addEventListener('error', onError);
	win.addEventListener('unhandledrejection', onRejection);
	return {
		report: (input, context = currentContext()) => void reporter.report(input, context),
		reportFailure: (failure) => note({ failure, kind: 'render' }),
		uninstall() {
			if (win.fetch === instrumentedFetch) win.fetch = nativeFetch;
			win.removeEventListener('online', resendUnsent);
			win.removeEventListener('pagehide', onLeaving);
			win.removeEventListener('pageshow', onReturning);
			win.removeEventListener('error', onError);
			win.removeEventListener('unhandledrejection', onRejection);
		}
	};
}
