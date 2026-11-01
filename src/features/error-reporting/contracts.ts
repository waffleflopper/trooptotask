import { z } from 'zod';
import { CLIENT_REPORT_KINDS, type ErrorKind } from './failureCapture';

export {
	CLIENT_REPORT_KINDS,
	ERROR_KINDS,
	MAX_CAPTURED_MESSAGE_LENGTH,
	classifyFailure,
	normalizeFailureMessage,
	sanitizeFailureForCapture,
	type CapturedFailure,
	type ClientReportKind,
	type ErrorKind,
	type FailureSource
} from './failureCapture';

export { ERROR_REFERENCE_HEADER } from '$lib/errors';

export type ErrorOrigin = 'server' | 'client_reported';
export type ErrorGroupStatus = 'open' | 'resolved';

/** Occurrences are kept this long; Scheduled maintenance deletes older ones and the groups left empty. */
export const ERROR_RETENTION_DAYS = 30;

/** One failure to store. The server generates `reference` and attributes `userId` and `organizationId`. */
export interface ErrorOccurrenceInput {
	reference: string;
	origin: ErrorOrigin;
	kind: ErrorKind;
	name: string;
	code: string | null;
	message: string;
	routeId: string | null;
	method: string | null;
	httpStatus: number | null;
	userId: string | null;
	organizationId: string | null;
}

export interface ErrorGroupLinkedReport {
	id: string;
	category: string;
	createdAt: string;
}

/** A fingerprint's recent occurrences, counted from the retained window. */
export interface ErrorGroup {
	id: string;
	origin: ErrorOrigin;
	kind: ErrorKind;
	name: string;
	code: string | null;
	message: string;
	routeId: string | null;
	method: string | null;
	status: ErrorGroupStatus;
	firstSeenAt: string;
	lastSeenAt: string;
	resolvedAt: string | null;
	occurrenceCount: number;
	affectedUsers: number;
	reports: ErrorGroupLinkedReport[];
}

export interface ErrorGroupPage {
	groups: ErrorGroup[];
	total: number;
}

export const ERROR_GROUP_PAGE_SIZE = 25;

/** Route ids look like `/org/[orgId]/api/availability`: no query, no host, no values. */
const ROUTE_ID_SHAPE = /^\/[A-Za-z0-9_\-.[\]()=~@+*/]*$/;
export const MAX_ROUTE_ID_LENGTH = 200;

export function isRouteId(value: unknown): value is string {
	return typeof value === 'string' && value.length <= MAX_ROUTE_ID_LENGTH && ROUTE_ID_SHAPE.test(value);
}

/**
 * What a signed-in browser may send. The schema is strict, so an attribution field (user, Organization, reference,
 * origin) is rejected instead of ignored.
 */
export const clientErrorReportSchema = z
	.object({
		kind: z.enum(CLIENT_REPORT_KINDS),
		routeId: z.string().refine(isRouteId, 'Invalid route').nullable(),
		name: z.string().max(200),
		message: z.string().max(2000),
		method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']).nullable().optional(),
		status: z.number().int().min(100).max(599).nullable().optional()
	})
	.strict();

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

export interface ClientErrorReportResult {
	reference: string;
}
