import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';

/** What Activity narrows to. Every filter is optional and they combine. */
export interface AuditLogFilters {
	personId?: string;
	userId?: string;
	kind?: string;
	/** First day shown, "YYYY-MM-DD" in the viewer's time zone. */
	from?: string;
	/** Last day shown, "YYYY-MM-DD" in the viewer's time zone, included. */
	to?: string;
}

export const AUDIT_LOG_FILTER_PARAMS = {
	personId: 'person',
	userId: 'member',
	kind: 'kind',
	from: 'from',
	to: 'to'
} as const;

const kindSchema = z.string().regex(/^[A-Za-z0-9_.:>-]{1,120}$/);

const FIELD_SCHEMAS = {
	personId: uuidSchema,
	userId: uuidSchema,
	kind: kindSchema,
	from: dateOnlySchema,
	to: dateOnlySchema
} as const satisfies Record<keyof AuditLogFilters, z.ZodType<string>>;

/** The filters a URL names. A value that is not valid is left out, so a hand-edited link still opens the log. */
export function parseAuditLogFilters(params: URLSearchParams): AuditLogFilters {
	const filters: AuditLogFilters = {};
	for (const key of Object.keys(AUDIT_LOG_FILTER_PARAMS) as (keyof AuditLogFilters)[]) {
		const parsed = FIELD_SCHEMAS[key].safeParse(params.get(AUDIT_LOG_FILTER_PARAMS[key]));
		if (parsed.success) filters[key] = parsed.data;
	}
	return filters;
}

/** The query string for `filters`, in a fixed order so equal filters make equal URLs. */
export function auditLogFilterParams(filters: AuditLogFilters): URLSearchParams {
	const params = new URLSearchParams();
	for (const key of Object.keys(AUDIT_LOG_FILTER_PARAMS) as (keyof AuditLogFilters)[]) {
		const value = filters[key];
		if (value) params.set(AUDIT_LOG_FILTER_PARAMS[key], value);
	}
	return params;
}

export function hasAuditLogFilters(filters: AuditLogFilters): boolean {
	return Object.values(filters).some(Boolean);
}

/**
 * Where the next page starts: the oldest entry of this page, by the full-precision timestamp the database returned
 * and its id. Rows are ordered on both, so a page ends cleanly between entries that share a timestamp.
 */
export interface AuditLogCursor {
	timestamp: string;
	id: string;
}

const CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2}))_([0-9a-f-]{36})$/i;

export function encodeAuditLogCursor(cursor: AuditLogCursor): string {
	return `${cursor.timestamp}_${cursor.id}`;
}

/** The cursor an earlier page returned, or null for text that no page returned. The timestamp reaches a database filter, so only its shape is accepted. */
export function decodeAuditLogCursor(text: string): AuditLogCursor | null {
	const match = CURSOR_PATTERN.exec(text);
	if (!match || !uuidSchema.safeParse(match[2]).success) return null;
	return { timestamp: match[1], id: match[2] };
}

export const auditLogCursorSchema = z.string().refine((text) => decodeAuditLogCursor(text) !== null, 'Invalid cursor');
