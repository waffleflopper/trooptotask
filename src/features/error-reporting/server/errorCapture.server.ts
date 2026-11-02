import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ErrorKind, ErrorOccurrenceInput, ErrorOrigin } from '../contracts';
import { sanitizeFailureForCapture } from '../failureCapture';

/** An occurrence plus the fingerprint that decides which group it joins. */
export interface StoredErrorOccurrence extends ErrorOccurrenceInput {
	fingerprint: string;
}

/** Who and where a failure happened. Resolved when it is noted, so a request that is still being admitted attributes correctly. */
export interface CaptureConfig {
	record(occurrence: StoredErrorOccurrence): Promise<void>;
	routeId: string | null;
	method: string | null;
	userId(): string | null;
	/** The Organization the request actually admitted, never a raw URL segment. */
	organizationId(): Promise<string | null>;
	timeoutMs?: number;
}

export const DEFAULT_RECORDING_TIMEOUT_MS = 1500;

export function fingerprintFailure(input: {
	origin: ErrorOrigin;
	kind: ErrorKind;
	routeId: string | null;
	method: string | null;
	name: string;
	code: string | null;
	message: string;
}): string {
	return createHash('sha256')
		.update(
			[
				input.origin,
				input.kind,
				input.routeId ?? '',
				input.method ?? '',
				input.name,
				input.code ?? '',
				input.message
			].join('\n')
		)
		.digest('hex');
}

export interface CaptureInput {
	failure: unknown;
	origin: ErrorOrigin;
	kind: ErrorKind;
	status: number | null;
	/** Omitted by the server: it generates the reference. */
	reference?: string;
}

export interface CapturedRecording {
	reference: string;
	/** Settles `true` once stored. It never rejects: a failure is logged and settles `false`. */
	recorded: Promise<boolean>;
}

/**
 * Start recording one failure. The reference exists before the write, so a response can name it at once. Recording
 * never throws into the request and never waits longer than the timeout; a failure falls back to a sanitized log.
 */
export function captureFailure(config: CaptureConfig, input: CaptureInput): CapturedRecording {
	const reference = input.reference ?? randomUUID();
	const captured = sanitizeFailureForCapture(input.failure);
	const timeoutMs = config.timeoutMs ?? DEFAULT_RECORDING_TIMEOUT_MS;

	const store = async (): Promise<boolean> => {
		const organizationId = await config.organizationId().catch(() => null);
		const occurrence: StoredErrorOccurrence = {
			reference,
			origin: input.origin,
			kind: input.kind,
			name: captured.name,
			code: captured.code,
			message: captured.message,
			routeId: config.routeId,
			method: config.method,
			httpStatus: input.status,
			userId: config.userId(),
			organizationId,
			fingerprint: fingerprintFailure({
				origin: input.origin,
				kind: input.kind,
				routeId: config.routeId,
				method: config.method,
				name: captured.name,
				code: captured.code,
				message: captured.message
			})
		};
		await config.record(occurrence);
		return true;
	};

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), timeoutMs);
	});

	const recorded = Promise.race([store(), timeout])
		.catch((cause: unknown) => {
			console.error('[error-capture] Recording failed:', sanitizeFailureForCapture(cause).message);
			return false;
		})
		.then((stored) => {
			clearTimeout(timer);
			if (!stored) {
				console.error('[error-capture] Not recorded:', {
					kind: input.kind,
					origin: input.origin,
					name: captured.name,
					code: captured.code,
					message: captured.message,
					routeId: config.routeId,
					status: input.status
				});
			}
			return stored;
		});
	return { reference, recorded };
}

interface ErrorScope {
	config: CaptureConfig;
	/** Newest last. */
	references: string[];
	recordings: Map<string, Promise<boolean>>;
	/** The response has been sent, so nothing awaits a recording unless the caller does. */
	closed: boolean;
}

const scopes = new AsyncLocalStorage<ErrorScope>();

export interface ErrorScopeResult<T> {
	result: T;
	/** The reference of the newest failure noted while the scope ran, or null. */
	reference: string | null;
}

/**
 * Open the scope one request notes its failures in. Synchronous call sites (`rethrowOrWrap`, `toActionFailure`)
 * note into it without becoming async. When `work` settles, every recording is awaited, so a serverless response
 * does not end with a write still in flight. A failure noted later, such as a streamed rejection, records at once.
 */
export async function runInErrorScope<T>(
	config: CaptureConfig,
	work: (scope: { noted(): number; note(input: Omit<CaptureInput, 'origin'>): string }) => Promise<T>
): Promise<ErrorScopeResult<T>> {
	const scope: ErrorScope = { config, references: [], recordings: new Map(), closed: false };
	const handle = {
		noted: () => scope.references.length,
		note: (input: Omit<CaptureInput, 'origin'>) => noteInScope(scope, input)
	};
	try {
		const result = await scopes.run(scope, () => work(handle));
		await settleRecordings(scope);
		return { result, reference: scope.references.at(-1) ?? null };
	} catch (thrown) {
		await settleRecordings(scope);
		throw thrown;
	}
}

/** A streamed rejection can note another failure during the wait, so this waits until none is new, then closes. */
async function settleRecordings(scope: ErrorScope): Promise<void> {
	let settled = -1;
	while (settled !== scope.recordings.size) {
		settled = scope.recordings.size;
		await Promise.all(scope.recordings.values());
	}
	scope.closed = true;
}

function noteInScope(scope: ErrorScope, input: Omit<CaptureInput, 'origin'>): string {
	const { reference, recorded } = captureFailure(scope.config, { ...input, origin: 'server' });
	scope.references.push(reference);
	scope.recordings.set(reference, recorded);
	return reference;
}

/** Note a failure on the running request's scope. Returns its reference, or null when no request scope is open. */
export function noteServerFailure(input: Omit<CaptureInput, 'origin' | 'reference'>): string | null {
	const scope = scopes.getStore();
	return scope ? noteInScope(scope, input) : null;
}

/**
 * The write behind a reference noted on this request, when it must be awaited by the caller: only once the scope has
 * closed, as for a streamed rejection. While the scope is open it awaits the write itself, and a caller that returns a
 * promise during server rendering has its result discarded.
 */
export function recordingAfterResponse(reference: string): Promise<boolean> | null {
	const scope = scopes.getStore();
	return scope?.closed ? (scope.recordings.get(reference) ?? null) : null;
}
