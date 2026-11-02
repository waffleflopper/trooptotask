/** A reference the server named, or a report the browser is still sending that settles with one (null when it was not stored). */
export type PendingErrorReference = string | Promise<string | null>;

/** How long after a failure a failure toast may still point at it. */
export const FRESH_ERROR_REFERENCE_MS = 3000;

interface LedgerEntry {
	reference: PendingErrorReference;
	/** The Organization URL segment the failure happened under, or null outside one. */
	org: string | null;
	at: number;
}

let newest: LedgerEntry | null = null;

/** Remember the newest failure the browser saw, so the failure toast it causes can offer to report it. */
export function recordErrorReference(reference: PendingErrorReference, org: string | null, now = Date.now()): void {
	newest = { reference, org, at: now };
}

/** The reference behind a toast shown now, taken once: a second toast gets nothing. Another Organization's failure is never offered. */
export function takeFreshErrorReference(org: string | null, now = Date.now()): PendingErrorReference | null {
	if (!newest || newest.org !== org || now - newest.at > FRESH_ERROR_REFERENCE_MS) return null;
	const { reference } = newest;
	newest = null;
	return reference;
}

export function clearErrorReferences(): void {
	newest = null;
}

type ClientFailureSink = (failure: unknown) => void;

let clientFailureSink: ClientFailureSink | null = null;

/** The page's error capture registers here, so code with no request behind it can report a failure it caught. */
export function setClientFailureSink(sink: ClientFailureSink | null): void {
	clientFailureSink = sink;
}

/**
 * Report an exception a handler caught before showing a failure toast, such as a document the browser failed to build.
 * Requests are watched already; this is for failures with no request to see. Call it just before the toast.
 */
export function reportClientFailure(failure: unknown): void {
	clientFailureSink?.(failure);
}
