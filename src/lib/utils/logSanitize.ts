const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const FORMATTED_ID_PATTERN = /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g;
const FORMATTED_PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g;
const LONG_DIGIT_PATTERN = /\d{7,}/g;
const MAX_LOG_LENGTH = 1000;
const TRUNCATED_MARKER = '… [truncated]';
const LOG_OBJECT_KEYS = ['name', 'message', 'code', 'details', 'hint'] as const;

/**
 * Produce a bounded, PII-masked diagnostic string for an unknown thrown value.
 * Never serializes arbitrary object graphs — only named diagnostic fields —
 * so row payloads inside Supabase/Postgres errors can't leak into logs.
 */
export function sanitizeErrorForLog(err: unknown): string {
	const extracted = extractDiagnosticString(err);
	const masked = maskSensitiveText(extracted);

	if (masked.length <= MAX_LOG_LENGTH) {
		return masked;
	}

	return `${masked.slice(0, MAX_LOG_LENGTH - TRUNCATED_MARKER.length)}${TRUNCATED_MARKER}`;
}

function extractDiagnosticString(err: unknown): string {
	if (err instanceof Error) {
		const parts = [`name=${err.name}`, `message=${err.message}`];

		if (err.stack) {
			parts.push(`stack=${err.stack.split('\n').slice(0, 5).join('\n')}`);
		}

		return parts.join(' ');
	}

	if (err && typeof err === 'object') {
		const record = err as Record<string, unknown>;

		return LOG_OBJECT_KEYS.flatMap((key) => {
			const value = record[key];

			if (typeof value === 'string' || typeof value === 'number') {
				return `${key}=${String(value)}`;
			}

			return [];
		}).join(' ');
	}

	return String(err);
}

function maskSensitiveText(value: string): string {
	return value
		.replace(EMAIL_PATTERN, '[email]')
		.replace(FORMATTED_ID_PATTERN, '[number]')
		.replace(FORMATTED_PHONE_PATTERN, '[number]')
		.replace(LONG_DIGIT_PATTERN, '[number]');
}
