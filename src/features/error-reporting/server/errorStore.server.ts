import type { SupabaseClient } from '$lib/server/database';
import type { ErrorGroup, ErrorGroupPage, ErrorGroupStatus } from '../contracts';
import type { StoredErrorOccurrence } from './errorCapture.server';

export interface ErrorRecordingStore {
	record(occurrence: StoredErrorOccurrence): Promise<void>;
}

export interface ErrorReferenceStore {
	/** Whether this occurrence exists and was attributed to this account. */
	isOwnedBy(input: { reference: string; userId: string }): Promise<boolean>;
}

export interface ErrorGroupReader {
	list(input: { status: ErrorGroupStatus; limit: number; offset: number }): Promise<ErrorGroupPage>;
}

export type ResolveErrorGroupResult = { status: 'resolved'; resolvedAt: string } | { status: 'not_open' };

export interface ErrorGroupResolver {
	resolve(input: { groupId: string; actorUserId: string }): Promise<ResolveErrorGroupResult>;
	/** Undo exactly one resolution, so a resolve whose required audit failed can be retried. */
	reopen(input: { groupId: string; actorUserId: string; resolvedAt: string }): Promise<void>;
}

/** The generated RPC types mark every argument non-null although the function accepts NULL for these. */
function orNull<T>(value: T | null | undefined): T {
	return (value ?? null) as T;
}

/** Bound by delivery to a privileged client after the caller is admitted; the tables have no policies for any other role. */
export function createSupabaseErrorRecordingStore(getClient: () => SupabaseClient): ErrorRecordingStore {
	return {
		async record(occurrence) {
			const { error } = await getClient().rpc('record_platform_error', {
				p_reference: occurrence.reference,
				p_fingerprint: occurrence.fingerprint,
				p_origin: occurrence.origin,
				p_kind: occurrence.kind,
				p_name: occurrence.name,
				p_code: orNull(occurrence.code),
				p_message: occurrence.message,
				p_route_id: orNull(occurrence.routeId),
				p_method: orNull(occurrence.method),
				p_http_status: orNull(occurrence.httpStatus),
				p_user_id: orNull(occurrence.userId),
				p_organization_id: orNull(occurrence.organizationId)
			});
			if (error) throw new Error('Failed to record error', { cause: error });
		}
	};
}

export function createSupabaseErrorReferenceStore(getClient: () => SupabaseClient): ErrorReferenceStore {
	return {
		async isOwnedBy({ reference, userId }) {
			const { data, error } = await getClient()
				.from('platform_error_occurrences')
				.select('id')
				.eq('id', reference)
				.eq('user_id', userId)
				.maybeSingle();
			if (error) throw new Error('Failed to read error reference', { cause: error });
			return data !== null;
		}
	};
}

interface ErrorGroupRow {
	id: string;
	origin: ErrorGroup['origin'];
	kind: ErrorGroup['kind'];
	name: string;
	code: string | null;
	message: string;
	route_id: string | null;
	method: string | null;
	status: ErrorGroupStatus;
	first_seen_at: string;
	last_seen_at: string;
	resolved_at: string | null;
	occurrence_count: number;
	affected_users: number;
	reports: ErrorGroup['reports'];
	total_count: number;
}

/** Constructed after Platform admission. */
export function createSupabaseErrorGroupReader(client: SupabaseClient): ErrorGroupReader {
	return {
		async list({ status, limit, offset }) {
			const { data, error } = await client.rpc('list_platform_error_groups', {
				p_status: status,
				p_limit: limit,
				p_offset: offset
			});
			if (error) throw new Error('Failed to list errors', { cause: error });
			const rows = (data ?? []) as unknown as ErrorGroupRow[];
			return {
				total: Number(rows[0]?.total_count ?? 0),
				groups: rows.map((row) => ({
					id: row.id,
					origin: row.origin,
					kind: row.kind,
					name: row.name,
					code: row.code,
					message: row.message,
					routeId: row.route_id,
					method: row.method,
					status: row.status,
					firstSeenAt: row.first_seen_at,
					lastSeenAt: row.last_seen_at,
					resolvedAt: row.resolved_at,
					occurrenceCount: Number(row.occurrence_count),
					affectedUsers: Number(row.affected_users),
					reports: row.reports
				}))
			};
		}
	};
}

export function createSupabaseErrorGroupResolver(client: SupabaseClient): ErrorGroupResolver {
	return {
		async resolve({ groupId, actorUserId }) {
			const resolvedAt = new Date().toISOString();
			const { data, error } = await client
				.from('platform_error_groups')
				.update({ status: 'resolved', resolved_at: resolvedAt, resolved_by: actorUserId })
				.eq('id', groupId)
				.eq('status', 'open')
				.select('id')
				.maybeSingle();
			if (error) throw new Error('Failed to resolve error', { cause: error });
			return data ? { status: 'resolved', resolvedAt } : { status: 'not_open' };
		},

		async reopen({ groupId, actorUserId, resolvedAt }) {
			const { error } = await client
				.from('platform_error_groups')
				.update({ status: 'open', resolved_at: null, resolved_by: null })
				.eq('id', groupId)
				.eq('status', 'resolved')
				.eq('resolved_by', actorUserId)
				.eq('resolved_at', resolvedAt);
			if (error) throw new Error('Failed to reopen error', { cause: error });
		}
	};
}

/** Scheduled delivery admits the configured credential before this owned operation. Returns the occurrences deleted. */
export async function cleanupPlatformErrors(client: SupabaseClient): Promise<number> {
	const { data, error } = await client.rpc('cleanup_old_platform_errors');
	if (error) throw new Error('Error retention failed', { cause: error });
	return typeof data === 'number' ? data : 0;
}
