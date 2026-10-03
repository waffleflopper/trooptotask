import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type {
	OrganizationSupportOrganization,
	OrganizationSupportOwnerMembershipMetric,
	OrganizationSupportReader,
	OrganizationSupportSuspensionCommands
} from './supportReadTypes';

const ORGANIZATION_COLUMNS = 'id, name, suspended_at, created_at';
type Response<T> = { data: T | null; error: unknown; count?: number | null };

function success<T>(response: Response<T>): T | null {
	if (response.error) throw response.error;
	return response.data;
}

function readCount(value: number | string | null): number {
	const count = typeof value === 'number' ? value : Number(value);
	if (value === null || (typeof value === 'string' && value.trim() === '') || !Number.isSafeInteger(count) || count < 0)
		throw new Error('Organization count was unavailable');
	return count;
}

function exactCount(response: Response<unknown>): number {
	success(response);
	return readCount(response.count ?? null);
}

function acknowledgeSuspension(response: Response<unknown>, organizationId: string): void {
	const rows = success(response);
	if (
		!Array.isArray(rows) ||
		rows.length !== 1 ||
		!rows[0] ||
		typeof rows[0] !== 'object' ||
		typeof rows[0].id !== 'string' ||
		rows[0].id.toLowerCase() !== organizationId.toLowerCase()
	)
		throw new Error('Suspension change could not be confirmed');
}

export function createOrganizationSupportSuspensionCommands(
	client: SupabaseClient
): OrganizationSupportSuspensionCommands {
	return {
		async suspendOrganization({ organizationId, suspendedAt }) {
			acknowledgeSuspension(
				await client
					.from('organizations')
					.update({ suspended_at: suspendedAt.toISOString() })
					.eq('id', organizationId)
					.select('id'),
				organizationId
			);
		},
		async unsuspendOrganization(organizationId) {
			acknowledgeSuspension(
				await client.from('organizations').update({ suspended_at: null }).eq('id', organizationId).select('id'),
				organizationId
			);
		}
	};
}

/** Bound only after platform support admission at the server delivery edge. */
export function createOrganizationSupportReader(client: SupabaseClient): OrganizationSupportReader {
	return {
		async listOrganizationsPage(query) {
			let builder = client
				.from('organizations')
				.select(ORGANIZATION_COLUMNS, { count: 'exact' })
				.order('created_at', { ascending: false });
			if (query.q) builder = builder.ilike('name', `%${query.q}%`);
			if (query.status === 'active') builder = builder.is('suspended_at', null);
			else if (query.status === 'suspended') builder = builder.not('suspended_at', 'is', null);
			const response = (await builder.range(query.from, query.to)) as Response<OrganizationSupportOrganization[]>;
			return { organizations: success(response) ?? [], totalCount: exactCount(response) };
		},
		async getOrganizationById(organizationId) {
			return success(
				await client
					.from('organizations')
					.select(ORGANIZATION_COLUMNS)
					.eq('id', organizationId)
					.maybeSingle<OrganizationSupportOrganization>()
			);
		},
		async searchOrganizationsByName({ query, maxResults }) {
			return (
				success(await client.from('organizations').select('id, name').ilike('name', `%${query}%`).limit(maxResults)) ??
				[]
			);
		},
		async listLatestOrganizations({ limit }) {
			return (
				success(
					await client
						.from('organizations')
						.select('id, name, created_at')
						.order('created_at', { ascending: false })
						.order('id', { ascending: false })
						.limit(limit)
				) ?? []
			);
		},
		async listMembershipUserIds(userIds) {
			const ids = [...new Set(userIds.filter(Boolean))];
			if (ids.length === 0) return [];
			const response = await selectAllSupabaseRows<{ user_id: string }>(
				(from, to) =>
					client
						.from('organization_memberships')
						.select('user_id')
						.in('user_id', ids)
						.order('id', { ascending: true })
						.range(from, to) as unknown as Promise<Response<Array<{ user_id: string }>>>
			);
			return (success(response) ?? []).map((row) => row.user_id);
		},
		async listMembershipsForUser(userId) {
			type Organization = { id: string; name: string };
			type Membership = { role: string; organizations: Organization | Organization[] | null };
			const response = await selectAllSupabaseRows<Membership>(
				(from, to) =>
					client
						.from('organization_memberships')
						.select('role, organizations(id, name)')
						.eq('user_id', userId)
						.order('id', { ascending: true })
						.range(from, to) as unknown as Promise<Response<Membership[]>>
			);
			return (success(response) ?? []).map((row) => ({
				userId,
				role: row.role,
				organization: Array.isArray(row.organizations) ? (row.organizations[0] ?? null) : row.organizations
			}));
		},
		async countMembershipsByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return new Map();
			const response = (await client.rpc('count_memberships_by_organization', { p_org_ids: ids })) as Response<
				Array<{ organization_id: string; membership_count: number | string | null }>
			>;
			const requested = new Set(ids);
			return new Map(
				(success(response) ?? [])
					.filter((row) => requested.has(row.organization_id))
					.map((row) => [row.organization_id, readCount(row.membership_count)])
			);
		},
		async countLeaderMembershipsByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return new Map();
			const response = await selectAllSupabaseRows<{ organization_id: string }>(
				(from, to) =>
					client
						.from('organization_memberships')
						.select('id, organization_id')
						.in('organization_id', ids)
						.in('role', ['owner', 'admin'])
						.order('organization_id', { ascending: true })
						.order('id', { ascending: true })
						.range(from, to) as unknown as Promise<Response<Array<{ organization_id: string }>>>
			);
			const counts = new Map<string, number>();
			for (const row of success(response) ?? [])
				counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
			return counts;
		},
		async listOwnerMembershipMetricsByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return [];
			type Row = {
				organization_id: string;
				owner_count: number | string | null;
				owner_user_id: string | null;
				owner_email: string | null;
			};
			const response = (await client.rpc('list_platform_owner_membership_metrics', { p_org_ids: ids })) as Response<
				Row[]
			>;
			const requested = new Set(ids);
			return (success(response) ?? [])
				.filter((row) => requested.has(row.organization_id))
				.map((row): OrganizationSupportOwnerMembershipMetric => {
					const ownerCount = readCount(row.owner_count);
					if (ownerCount === 1 && !row.owner_user_id) throw new Error('Owner membership could not be identified');
					return {
						organizationId: row.organization_id,
						ownerCount,
						singleOwner:
							ownerCount === 1
								? { organizationId: row.organization_id, userId: row.owner_user_id!, email: row.owner_email }
								: null
					};
				});
		},
		async countOrganizations() {
			return exactCount(await client.from('organizations').select('*', { count: 'exact', head: true }));
		}
	};
}
