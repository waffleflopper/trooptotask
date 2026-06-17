import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { createSupabasePlatformMetrics } from './supabasePlatformMetrics';
import {
	createPlatformUserDirectory,
	type PlatformDirectoryAuthUser,
	type PlatformUserDirectory,
	type PlatformUserDirectoryMembership,
	type PlatformUserDirectoryOrganization,
	type PlatformUserDirectoryStore,
	type PlatformUserDirectorySuspension
} from '$lib/server/core/useCases/platformUserDirectory';
import type { Tier } from '$lib/types/subscription';

type SupabaseQueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;
type SupabaseResponse<T> = { data: T | null; error: unknown };

const AUTH_USERS_PER_PAGE = 1000;

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

interface MembershipUserRow {
	user_id: string;
}

interface SuspensionUserRow {
	user_id: string;
}

interface SuspensionRow {
	user_id: string;
	suspended_at: string;
	suspended_by: string;
	reason: string | null;
}

interface OrganizationRow {
	id: string;
	name: string;
	tier: Tier | null;
	gift_tier: Tier | null;
}

interface MembershipWithOrganizationRow {
	user_id?: string;
	role: string;
	organizations: OrganizationRow | OrganizationRow[] | null;
}

function formatSupabaseError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const candidate = error as { message?: unknown; code?: unknown };
		const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error);
		return typeof candidate.code === 'string' ? `${message} (${candidate.code})` : message;
	}
	return String(error);
}

function throwIfSupabaseError(operation: string, error: unknown): void {
	if (error) throw new Error(`${operation} failed: ${formatSupabaseError(error)}`);
}

function isNotFoundAuthError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
	if (candidate.status === 404 || candidate.code === 'user_not_found') return true;
	return typeof candidate.message === 'string' && /\buser\b.*\bnot\s+found\b/i.test(candidate.message);
}

function getNextAuthUsersPage(currentPage: number, pageData: AuthUsersPage | null): number | null {
	const nextPage = pageData?.nextPage;
	if (typeof nextPage !== 'number' || !Number.isFinite(nextPage) || nextPage < 1) return null;
	// auth-js 2.106.1 can truncate page 10+ Link values to the first digit.
	// Keep pagination monotonic while still honoring provider continuation.
	return nextPage > currentPage ? nextPage : currentPage + 1;
}

function mapAuthUser(user: RawAuthUser): PlatformDirectoryAuthUser {
	return {
		id: user.id,
		email: user.email ?? null,
		createdAt: user.created_at,
		lastSignInAt: user.last_sign_in_at ?? null,
		emailConfirmedAt: user.email_confirmed_at ?? user.confirmed_at ?? null
	};
}

function normalizeOrganization(value: OrganizationRow | OrganizationRow[] | null): OrganizationRow | null {
	if (Array.isArray(value)) return value[0] ?? null;
	return value;
}

function mapOrganization(row: OrganizationRow | null): PlatformUserDirectoryOrganization | null {
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		tier: row.tier ?? 'free',
		giftTier: row.gift_tier
	};
}

function mapMembership(row: MembershipWithOrganizationRow, userId: string): PlatformUserDirectoryMembership {
	return {
		userId,
		role: row.role,
		organization: mapOrganization(normalizeOrganization(row.organizations))
	};
}

function mapSuspension(row: SuspensionRow): PlatformUserDirectorySuspension {
	return {
		userId: row.user_id,
		suspendedAt: row.suspended_at,
		suspendedBy: row.suspended_by,
		reason: row.reason
	};
}

export function createSupabasePlatformUserDirectoryStore(supabase: SupabaseClient): PlatformUserDirectoryStore {
	return {
		async listAuthUsers() {
			let page = 1;
			const users: PlatformDirectoryAuthUser[] = [];

			while (true) {
				const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: AUTH_USERS_PER_PAGE });
				if (error) {
					console.error('[admin/users] auth.admin.listUsers error:', error);
					return { status: 'auth_error', message: formatSupabaseError(error) };
				}

				const pageData = data as AuthUsersPage | null;
				const pageUsers = (pageData?.users ?? []).map(mapAuthUser);
				users.push(...pageUsers);
				const nextPage = getNextAuthUsersPage(page, pageData);
				if (!nextPage) break;
				page = nextPage;
			}

			return { status: 'ok', users };
		},

		async getAuthUser(userId) {
			const { data, error } = await supabase.auth.admin.getUserById(userId);
			if (error) {
				if (isNotFoundAuthError(error)) return { status: 'not_found' };
				console.error('[admin/users] auth.admin.getUserById error:', error);
				return { status: 'auth_error', message: formatSupabaseError(error) };
			}
			if (!data?.user) return { status: 'not_found' };
			return { status: 'ok', user: mapAuthUser(data.user as RawAuthUser) };
		},

		async listMembershipUserIds(userIds) {
			if (userIds.length === 0) return [];
			const { data, error } = await selectAllSupabaseRows<MembershipUserRow>(
				(from, to) =>
					supabase
						.from('organization_memberships')
						.select('user_id')
						.in('user_id', userIds)
						.range(from, to) as unknown as SupabaseQueryResult<MembershipUserRow>
			);
			throwIfSupabaseError('table organization_memberships user count fetch', error);
			return (data ?? []).map((row) => row.user_id);
		},

		async listSuspendedUserIds(userIds) {
			if (userIds.length === 0) return [];
			const { data, error } = await selectAllSupabaseRows<SuspensionUserRow>(
				(from, to) =>
					supabase
						.from('user_suspensions')
						.select('user_id')
						.in('user_id', userIds)
						.range(from, to) as unknown as SupabaseQueryResult<SuspensionUserRow>
			);
			throwIfSupabaseError('table user_suspensions list fetch', error);
			return (data ?? []).map((row) => row.user_id);
		},

		async listMembershipsForUser(userId) {
			const { data, error } = await selectAllSupabaseRows<MembershipWithOrganizationRow>(
				(from, to) =>
					supabase
						.from('organization_memberships')
						.select('role, organizations(id, name, tier, gift_tier)')
						.eq('user_id', userId)
						.range(from, to) as unknown as SupabaseQueryResult<MembershipWithOrganizationRow>
			);
			throwIfSupabaseError('table organization_memberships user detail fetch', error);
			return (data ?? []).map((row) => mapMembership(row, userId));
		},

		async getSuspensionForUser(userId) {
			const response = (await supabase
				.from('user_suspensions')
				.select('user_id, suspended_at, suspended_by, reason')
				.eq('user_id', userId)
				.maybeSingle()) as SupabaseResponse<SuspensionRow>;
			throwIfSupabaseError('table user_suspensions detail fetch', response.error);
			return response.data ? mapSuspension(response.data) : null;
		}
	};
}

export function createSupabasePlatformUserDirectory(ctx: AdminContext): PlatformUserDirectory {
	return createPlatformUserDirectory({
		store: createSupabasePlatformUserDirectoryStore(ctx.adminClient),
		metrics: createSupabasePlatformMetrics(ctx)
	});
}
