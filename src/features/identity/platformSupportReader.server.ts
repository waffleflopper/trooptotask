import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type {
	IdentityPlatformSupportReader,
	IdentitySupportAccount,
	IdentitySupportSuspension,
	IdentitySupportUserLabel
} from './contracts';

interface RawAuthUser {
	id: string;
	email?: string | null;
	created_at: string;
	last_sign_in_at?: string | null;
	email_confirmed_at?: string | null;
	confirmed_at?: string | null;
}

interface AuthUsersPage {
	users?: RawAuthUser[];
	nextPage?: number | null;
}

interface SuspensionRow {
	user_id: string;
	suspended_at: string;
	suspended_by: string;
	reason: string | null;
}

function isMissingUser(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
	return (
		candidate.status === 404 ||
		candidate.code === 'user_not_found' ||
		(typeof candidate.message === 'string' && /\buser\b.*\bnot\s+found\b/i.test(candidate.message))
	);
}

function mapAccount(user: RawAuthUser): IdentitySupportAccount {
	if (
		typeof user.id !== 'string' ||
		typeof user.created_at !== 'string' ||
		(user.email != null && typeof user.email !== 'string') ||
		(user.last_sign_in_at != null && typeof user.last_sign_in_at !== 'string') ||
		(user.email_confirmed_at != null && typeof user.email_confirmed_at !== 'string') ||
		(user.confirmed_at != null && typeof user.confirmed_at !== 'string')
	)
		throw new Error('User identity could not be verified');
	return {
		id: user.id,
		email: user.email ?? null,
		createdAt: user.created_at,
		lastSignInAt: user.last_sign_in_at ?? null,
		emailConfirmedAt: user.email_confirmed_at ?? user.confirmed_at ?? null
	};
}

function mapSuspension(row: SuspensionRow, userId: string): IdentitySupportSuspension {
	if (
		typeof row.user_id !== 'string' ||
		row.user_id.toLowerCase() !== userId.toLowerCase() ||
		typeof row.suspended_at !== 'string' ||
		typeof row.suspended_by !== 'string' ||
		(row.reason !== null && typeof row.reason !== 'string')
	)
		throw new Error('User suspension could not be verified');
	return {
		userId: row.user_id,
		suspendedAt: row.suspended_at,
		suspendedBy: row.suspended_by,
		reason: row.reason
	};
}

/** Account source facts only. Platform composition supplies current support authority. */
export function createIdentityPlatformSupportReader(client: SupabaseClient): IdentityPlatformSupportReader {
	const reader: IdentityPlatformSupportReader = {
		async listAuthUsers() {
			const users: IdentitySupportAccount[] = [];
			let page = 1;
			try {
				while (true) {
					const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
					if (error || !data || !Array.isArray(data.users)) throw new Error('Account read unavailable');
					const pageData = data as AuthUsersPage;
					users.push(...data.users.map(mapAccount));
					const nextPage = pageData.nextPage;
					if (typeof nextPage !== 'number' || !Number.isFinite(nextPage) || nextPage < 1) break;
					// auth-js can truncate a page 10+ Link value to its first digit.
					page = nextPage > page ? nextPage : page + 1;
				}
				return { status: 'ok', users };
			} catch {
				return { status: 'auth_error', message: 'Unable to load platform accounts' };
			}
		},

		async getAuthUser(userId) {
			try {
				const { data, error } = await client.auth.admin.getUserById(userId);
				if (error) {
					if (isMissingUser(error)) return { status: 'not_found' };
					throw new Error('Account read unavailable');
				}
				if (!data?.user) return { status: 'not_found' };
				if (typeof data.user.id !== 'string' || data.user.id.toLowerCase() !== userId.toLowerCase())
					throw new Error('Account read identity mismatch');
				return { status: 'ok', user: mapAccount(data.user as RawAuthUser) };
			} catch {
				return { status: 'auth_error', message: 'Unable to load user identity' };
			}
		},

		async searchUsersByEmail(input) {
			const { data, error } = await client.rpc('search_users_by_email', {
				search_query: input.query,
				max_results: input.maxResults
			});
			if (error || !Array.isArray(data)) throw new Error('Unable to search platform accounts');
			return data.map((row: { id: string; email: string | null }) => {
				if (!row || typeof row.id !== 'string' || (row.email !== null && typeof row.email !== 'string'))
					throw new Error('Unable to search platform accounts');
				return { id: row.id, email: row.email };
			});
		},

		async listSuspendedUserIds(userIds) {
			const ids = [...new Set(userIds)];
			const suspendedIds: string[] = [];
			for (let offset = 0; offset < ids.length; offset += 200) {
				const batch = ids.slice(offset, offset + 200);
				const requestedIds = new Set(batch.map((id) => id.toLowerCase()));
				const { data, error } = await selectAllSupabaseRows<{ user_id: string }>(async (from, to) => {
					const result = await client
						.from('user_suspensions')
						.select('user_id')
						.in('user_id', batch)
						.order('user_id')
						.range(from, to);
					if (!result.error && !Array.isArray(result.data)) throw new Error('Unable to read user suspensions');
					return result;
				});
				if (error || !Array.isArray(data)) throw new Error('Unable to read user suspensions');
				if (data.some((row) => typeof row.user_id !== 'string' || !requestedIds.has(row.user_id.toLowerCase())))
					throw new Error('User suspension identities could not be verified');
				suspendedIds.push(...data.map((row) => row.user_id));
			}
			return suspendedIds;
		},

		async getSuspensionForUser(userId) {
			const { data, error } = await client
				.from('user_suspensions')
				.select('user_id, suspended_at, suspended_by, reason')
				.eq('user_id', userId)
				.maybeSingle();
			if (error || data === undefined) throw new Error('Unable to read user suspension');
			return data === null ? null : mapSuspension(data as SuspensionRow, userId);
		},

		async loadUserLabels(userIds) {
			const ids = [...new Set(userIds)];
			if (ids.length === 0) return new Map();
			const labels = new Map<string, IdentitySupportUserLabel>();
			for (let offset = 0; offset < ids.length; offset += 10) {
				await Promise.all(
					ids.slice(offset, offset + 10).map(async (userId) => {
						const account = await reader.getAuthUser(userId);
						labels.set(userId, {
							email: account.status === 'ok' ? account.user.email : null,
							firstName: null,
							lastName: null
						});
					})
				);
			}
			// These are optional review labels. A profile outage retains the known account
			// email (or unknown-inviter context); it never changes review authorization.
			try {
				for (let offset = 0; offset < ids.length; offset += 200) {
					const { data, error } = await selectAllSupabaseRows<{
						user_id: string;
						first_name: string | null;
						last_name: string | null;
					}>(async (from, to) =>
						client
							.from('user_profiles')
							.select('user_id, first_name, last_name')
							.in('user_id', ids.slice(offset, offset + 200))
							.order('user_id')
							.range(from, to)
					);
					if (!error) {
						for (const profile of data ?? []) {
							const label = labels.get(profile.user_id);
							if (label) {
								label.firstName = typeof profile.first_name === 'string' ? profile.first_name : null;
								label.lastName = typeof profile.last_name === 'string' ? profile.last_name : null;
							}
						}
					}
				}
			} catch {
				// Optional profile enrichment retains its current fallback behavior.
			}
			return labels;
		}
	};
	return reader;
}
