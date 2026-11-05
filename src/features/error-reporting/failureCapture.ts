/**
 * Error capture reads three named fields of a failure and nothing else. Postgres puts row values in `details` and
 * after "Failing row contains" in `message`, and a stack's first line repeats the message, so none of them are read.
 * The normalized message is also what makes two occurrences of one failure share a fingerprint.
 */
export interface CapturedFailure {
	name: string;
	code: string | null;
	message: string;
}

export const MAX_CAPTURED_MESSAGE_LENGTH = 300;
const MAX_NORMALIZED_INPUT_LENGTH = 2000;
const MAX_NAME_LENGTH = 80;
const MAX_CODE_LENGTH = 40;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_OR_APP_PATH = /\bhttps?:\/\/\S+|\/org\/\S+/gi;
/** Best effort: two or more capitalized words read as a person's name. A lone surname in free text can still pass. */
const PERSON_NAME = /\b[A-Z][a-z'-]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z'-]+)+\b|\b[A-Z]{2,},?\s+[A-Z]{2,}\b/g;
const QUOTED = /"[^"]*"|'[^']*'|`[^`]*`/g;
const UNCLOSED_QUOTE = /["'`]/;
const KEY_VALUE_PAIR = /\([^()]*\)\s*=\s*\([^()]*\)/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** A run this long and unbroken by spaces is a credential or opaque identifier, never a sentence. */
const TOKEN_RUN = /[A-Za-z0-9._~+/=-]{20,}/g;
/** One long word, such as a surname, is left for the name mask to read with the words around it. */
const WORD = /^[A-Z]?[a-z-]+$/;
/** Single-case words joined by `_` or `.` name a code or a schema object, such as ERR_CONNECTION_REFUSED; a credential mixes case. */
const IDENTIFIER = /^(?:[A-Z][A-Z0-9]*(?:_[A-Z][A-Z0-9]*)+|[a-z][a-z0-9]*(?:[._][a-z][a-z0-9]*)+)$/;
const DIGIT_RUN = /\d+/g;
const NAME_SHAPE = /^[A-Za-z_$][A-Za-z0-9_$.]*$/;
const CODE_SHAPE = /^[A-Za-z0-9_.:-]+$/;

function readField(source: unknown, key: 'name' | 'message' | 'code'): unknown {
	if (source === null || typeof source !== 'object') return undefined;
	return (source as Record<string, unknown>)[key];
}

function cutAt(text: string, marker: RegExp): string {
	const match = marker.exec(text);
	return match ? text.slice(0, match.index) : text;
}

/** A whole run is judged before any part of it is replaced, so a UUID inside a credential cannot split it. */
function maskOpaqueRun(run: string): string {
	// A sentence's closing period joins the run, so the shape is read without it.
	const shape = run.replace(/\.+$/, '');
	if (WORD.test(shape) || IDENTIFIER.test(shape)) return run;
	const ids = run.replace(UUID, '[id]');
	return /[A-Za-z0-9]/.test(ids.replaceAll('[id]', '')) ? '[token]' : ids;
}

export function normalizeFailureMessage(raw: string): string {
	// A failure's message can be any size; the patterns below only ever need the start of it.
	const withoutValues = cutAt(cutAt(raw.slice(0, MAX_NORMALIZED_INPUT_LENGTH), /Failing row contains/i), /\bDETAIL\b/);
	const quotesMasked = withoutValues.replace(URL_OR_APP_PATH, '[url]').replace(EMAIL, '[email]').replace(QUOTED, '?');
	// The limit can cut a quoted value before its closing quote, so a remaining quote may open one: drop what follows.
	const closed = raw.length > MAX_NORMALIZED_INPUT_LENGTH ? cutAt(quotesMasked, UNCLOSED_QUOTE) : quotesMasked;
	return closed
		.replace(KEY_VALUE_PAIR, '?')
		.replace(TOKEN_RUN, maskOpaqueRun)
		.replace(PERSON_NAME, '[name]')
		.replace(DIGIT_RUN, '[n]')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_CAPTURED_MESSAGE_LENGTH);
}

export function sanitizeFailureForCapture(failure: unknown): CapturedFailure {
	const rawName = readField(failure, 'name');
	const name = typeof rawName === 'string' && NAME_SHAPE.test(rawName) ? rawName.slice(0, MAX_NAME_LENGTH) : 'Error';

	const rawMessage = readField(failure, 'message');
	const message = normalizeFailureMessage(typeof rawMessage === 'string' ? rawMessage : '');

	const rawCode = readField(failure, 'code');
	const codeText = typeof rawCode === 'number' ? String(rawCode) : rawCode;
	const code =
		typeof codeText === 'string' && CODE_SHAPE.test(codeText) && codeText.length <= MAX_CODE_LENGTH ? codeText : null;

	return { name, code, message };
}

export const ERROR_KINDS = ['server_response', 'server_exception', 'render', 'transport', 'unconfirmed_write'] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

/** Kinds a signed-in browser may report; the server owns `server_response`. */
export const CLIENT_REPORT_KINDS = ['render', 'transport', 'unconfirmed_write', 'server_exception'] as const;
export type ClientReportKind = (typeof CLIENT_REPORT_KINDS)[number];

/** Where a failure was seen. Each source maps to a kind, or to none when the outcome is expected. */
export type FailureSource =
	| { source: 'server'; status: number; unknownException: boolean }
	| { source: 'client-navigation'; caught: 'app' | 'framework' | 'unknown'; status: number }
	| { source: 'fetch-rejection'; method: string }
	| { source: 'window-error' };

/**
 * The decision to capture lives here and nowhere else. Every 4xx (validation, permission, conflict, 404, rate limit)
 * is an expected outcome. A 5xx, an unknown exception, a render error, a transport failure and a write whose result
 * the browser never saw are not.
 */
export function classifyFailure(input: FailureSource): ErrorKind | null {
	switch (input.source) {
		case 'server':
			if (input.status >= 400 && input.status <= 499) return null;
			if (input.unknownException) return 'server_exception';
			return input.status >= 500 ? 'server_response' : null;
		case 'client-navigation':
			if (input.caught === 'framework' || (input.status >= 400 && input.status <= 499)) return null;
			return input.caught === 'unknown' ? 'render' : input.status >= 500 ? 'server_exception' : null;
		case 'fetch-rejection':
			return input.method === 'GET' || input.method === 'HEAD' ? 'transport' : 'unconfirmed_write';
		case 'window-error':
			return 'render';
	}
}
