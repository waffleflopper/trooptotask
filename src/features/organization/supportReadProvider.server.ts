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

function requiredRows<T>(response: Response<T[]>): T[] {
	const rows = success(response);
	if (!Array.isArray(rows)) throw new Error('Organization support facts were unavailable');
	return rows;
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Organization support facts were unavailable');
	return value as Record<string, unknown>;
}

function string(value: unknown): string {
	if (typeof value !== 'string') throw new Error('Organization support facts were unavailable');
	return value;
}

function id(value: unknown): string {
	const result = string(value);
	if (!result) throw new Error('Organization support identity was unavailable');
	return result;
}

function nullableString(value: unknown): string | null {
	return value === null ? null : string(value);
}

function organization(value: unknown): OrganizationSupportOrganization {
	const row = record(value);
	return {
		id: id(row.id),
		name: string(row.name),
		created_at: string(row.created_at),
		suspended_at: nullableString(row.suspended_at)
	};
}

function readCount(value: unknown): number {
	if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value)))
		throw new Error('Organization count was unavailable');
	const count = Number(value);
	if (!Number.isSafeInteger(count) || count < 0) throw new Error('Organization count was unavailable');
	return count;
}

function requestedId(value: unknown, requested: Map<string, string>): string {
	const target = requested.get(id(value).toLowerCase());
	if (!target) throw new Error('Organization support scope could not be verified');
	return target;
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
				.order('created_at', { ascending: false })
				.order('id', { ascending: false });
			if (query.q) builder = builder.ilike('name', `%${query.q}%`);
			if (query.status === 'active') builder = builder.is('suspended_at', null);
			else if (query.status === 'suspended') builder = builder.not('suspended_at', 'is', null);
			const response = (await builder.range(query.from, query.to)) as Response<OrganizationSupportOrganization[]>;
			return { organizations: requiredRows(response).map(organization), totalCount: exactCount(response) };
		},
		async getOrganizationById(organizationId) {
			const result = success(
				await client
					.from('organizations')
					.select(ORGANIZATION_COLUMNS)
					.eq('id', organizationId)
					.maybeSingle<OrganizationSupportOrganization>()
			);
			if (result === null) return null;
			const found = organization(result);
			if (found.id.toLowerCase() !== organizationId.toLowerCase())
				throw new Error('Organization support scope could not be verified');
			return found;
		},

		async searchOrganizationsByName({ query, maxResults }) {
			return requiredRows(
				await client.from('organizations').select('id, name').ilike('name', `%${query}%`).limit(maxResults)
			).map((value) => {
				const row = record(value);
				return { id: id(row.id), name: string(row.name) };
			});
		},

		async listLatestOrganizations({ limit }) {
			return requiredRows(
				await client
					.from('organizations')
					.select('id, name, created_at')
					.order('created_at', { ascending: false })
					.order('id', { ascending: false })
					.limit(limit)
			).map((value) => {
				const row = record(value);
				return { id: id(row.id), name: nullableString(row.name), created_at: nullableString(row.created_at) };
			});
		},

		async listMembershipUserIds(userIds) {
			const ids = [...new Set(userIds.filter(Boolean))];
			if (ids.length === 0) return [];
			const requested = new Map(ids.map((value) => [value.toLowerCase(), value]));
			const response = await selectAllSupabaseRows<{ user_id: string }>(async (from, to) => {
				const result = await client
					.from('organization_memberships')
					.select('user_id')
					.in('user_id', ids)
					.order('id', { ascending: true })
					.range(from, to);
				const data = requiredRows(result).map((value) => ({ user_id: requestedId(record(value).user_id, requested) }));
				return { ...result, data };
			});
			return requiredRows(response).map((row) => row.user_id);
		},

		async listMembershipsForUser(userId) {
			const response = await selectAllSupabaseRows<{ role: string; organization: { id: string; name: string } | null }>(
				async (from, to) => {
					const result = await client
						.from('organization_memberships')
						.select('role, organizations(id, name)')
						.eq('user_id', userId)
						.order('id', { ascending: true })
						.range(from, to);
					const data = requiredRows(result).map((value) => {
						const row = record(value);
						let joined = row.organizations;
						if (Array.isArray(joined)) {
							if (joined.length > 1) throw new Error('Organization membership affiliation could not be verified');
							joined = joined[0] ?? null;
						}
						let organization: { id: string; name: string } | null = null;
						if (joined !== null) {
							const named = record(joined);
							organization = { id: id(named.id), name: string(named.name) };
						}
						return { role: string(row.role), organization };
					});
					return { ...result, data };
				}
			);
			return requiredRows(response).map((row) => ({ userId, ...row }));
		},

		async countMembershipsByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return new Map();
			const response = await client.rpc('count_memberships_by_organization', { p_org_ids: ids });
			const requested = new Map(ids.map((value) => [value.toLowerCase(), value]));
			const counts = new Map<string, number>();
			for (const value of requiredRows(response)) {
				const row = record(value);
				const organizationId = requestedId(row.organization_id, requested);
				if (counts.has(organizationId)) throw new Error('Organization membership count was ambiguous');
				counts.set(organizationId, readCount(row.membership_count));
			}
			return counts;
		},

		async countLeaderMembershipsByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return new Map();
			const requested = new Map(ids.map((value) => [value.toLowerCase(), value]));
			const response = await selectAllSupabaseRows<{ organization_id: string }>(async (from, to) => {
				const result = await client
					.from('organization_memberships')
					.select('id, organization_id')
					.in('organization_id', ids)
					.in('role', ['owner', 'admin'])
					.order('organization_id', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to);
				const data = requiredRows(result).map((value) => {
					const row = record(value);
					id(row.id);
					return { organization_id: requestedId(row.organization_id, requested) };
				});
				return { ...result, data };
			});
			const counts = new Map<string, number>();
			for (const row of requiredRows(response))
				counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
			return counts;
		},

		async listOwnerMembershipMetricsByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return [];
			const response = await client.rpc('list_platform_owner_membership_metrics', { p_org_ids: ids });
			const requested = new Map(ids.map((value) => [value.toLowerCase(), value]));
			const seen = new Set<string>();
			return requiredRows(response).map((value): OrganizationSupportOwnerMembershipMetric => {
				const row = record(value);
				const organizationId = requestedId(row.organization_id, requested);
				if (seen.has(organizationId)) throw new Error('Organization owner count was ambiguous');
				seen.add(organizationId);
				const ownerCount = readCount(row.owner_count);
				if (ownerCount === 1 && (typeof row.owner_user_id !== 'string' || !row.owner_user_id))
					throw new Error('Owner membership could not be identified');
				const ownerEmail = nullableString(row.owner_email);
				if (ownerCount !== 1 && (row.owner_user_id !== null || ownerEmail !== null))
					throw new Error('Organization owner facts were inconsistent');
				return {
					organizationId,
					ownerCount,
					singleOwner: ownerCount === 1 ? { organizationId, userId: id(row.owner_user_id), email: ownerEmail } : null
				};
			});
		},

		async countOrganizations() {
			return exactCount(await client.from('organizations').select('*', { count: 'exact', head: true }));
		}
	};
}
