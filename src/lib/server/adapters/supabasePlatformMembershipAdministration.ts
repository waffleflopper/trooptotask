import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import {
	createPlatformMembershipAdministration,
	type PlatformMembershipAdministration,
	type PlatformMembershipAdministrationStore,
	type PlatformMembershipOrganization,
	type PlatformOrganizationMember,
	type PlatformMembershipRecord,
	type PlatformMembershipRole
} from '$lib/server/core/useCases/platformMembershipAdministration';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

interface OrganizationRow {
	id: string;
	name: string;
}

interface MembershipRow {
	organization_id: string;
	user_id: string;
	role: string;
}

interface OrganizationMemberRow {
	user_id: string;
	email: string | null;
	role: string;
}

type SupabaseQueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;

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

function assertSupabaseSuccess<T>(operation: string, response: SupabaseResponse<T>): void {
	if (response.error) {
		throw new Error(`${operation} failed: ${formatSupabaseError(response.error)}`);
	}
}

function assertSupabaseUpdated(operation: string, response: SupabaseResponse<unknown>): void {
	assertSupabaseSuccess(operation, response);
	if (!response.data) throw new Error(`${operation} failed: missing row`);
}

function mapMembershipRole(role: string): PlatformMembershipRole {
	if (role === 'owner' || role === 'admin' || role === 'member') return role;
	throw new Error(`Unsupported organization membership role: ${role}`);
}

function mapOrganization(row: OrganizationRow): PlatformMembershipOrganization {
	return {
		id: row.id,
		name: row.name
	};
}

function mapMembership(row: MembershipRow): PlatformMembershipRecord {
	return {
		orgId: row.organization_id,
		userId: row.user_id,
		role: mapMembershipRole(row.role)
	};
}

function mapOrganizationMember(row: OrganizationMemberRow): PlatformOrganizationMember {
	return {
		userId: row.user_id,
		email: row.email,
		role: mapMembershipRole(row.role)
	};
}

export function createSupabasePlatformMembershipAdministrationStore(
	supabase: SupabaseClient
): PlatformMembershipAdministrationStore {
	return {
		async listMembers(orgId) {
			const { data, error } = await selectAllSupabaseRows<OrganizationMemberRow>(
				(from, to) =>
					supabase
						.from('organization_memberships')
						.select('user_id, role, email')
						.eq('organization_id', orgId)
						.order('role')
						.range(from, to) as unknown as SupabaseQueryResult<OrganizationMemberRow>
			);
			if (error) {
				throw new Error(`table organization_memberships member list failed: ${formatSupabaseError(error)}`);
			}
			return (data ?? []).map(mapOrganizationMember);
		},

		async getOrganization(orgId) {
			const response = (await supabase
				.from('organizations')
				.select('id, name')
				.eq('id', orgId)
				.maybeSingle()) as SupabaseResponse<OrganizationRow>;
			assertSupabaseSuccess('table organizations membership administration fetch', response);
			return response.data ? mapOrganization(response.data) : null;
		},

		async getMembership(input) {
			const response = (await supabase
				.from('organization_memberships')
				.select('organization_id, user_id, role')
				.eq('organization_id', input.orgId)
				.eq('user_id', input.userId)
				.maybeSingle()) as SupabaseResponse<MembershipRow>;
			assertSupabaseSuccess('table organization_memberships membership fetch', response);
			return response.data ? mapMembership(response.data) : null;
		},

		async getCurrentOwner(orgId) {
			const response = (await supabase
				.from('organization_memberships')
				.select('organization_id, user_id, role')
				.eq('organization_id', orgId)
				.eq('role', 'owner')
				.limit(2)) as SupabaseResponse<MembershipRow[]>;
			assertSupabaseSuccess('table organization_memberships current owner fetch', response);
			const rows = response.data ?? [];
			if (rows.length > 1) {
				throw new Error('table organization_memberships current owner fetch failed: multiple owners');
			}
			return rows[0] ? mapMembership(rows[0]) : null;
		},

		async setMembershipRole(input) {
			const response = (await supabase
				.from('organization_memberships')
				.update({ role: input.role })
				.eq('organization_id', input.orgId)
				.eq('user_id', input.userId)
				.select('user_id')
				.maybeSingle()) as SupabaseResponse<{ user_id: string }>;
			assertSupabaseUpdated('table organization_memberships role update', response);
		}
	};
}

export function createSupabasePlatformMembershipAdministration(ctx: AdminContext): PlatformMembershipAdministration {
	return createPlatformMembershipAdministration({
		store: createSupabasePlatformMembershipAdministrationStore(ctx.adminClient),
		audit: (event) => ctx.audit(event)
	});
}
