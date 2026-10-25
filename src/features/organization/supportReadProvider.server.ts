import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type {
	OrganizationSupportOrganization,
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

function requestedId(value: unknown, requested: Map<string, string>): string {
	const target = requested.get(id(value).toLowerCase());
	if (!target) throw new Error('Organization support scope could not be verified');
	return target;
}

function acknowledgeSuspension(response: Response<unknown>): void {
	if (success(response) !== true) throw new Error('Suspension change could not be confirmed');
}

/** One SQL command keeps the suspension and its operator note together and checks the actor is an operator. */
export function createOrganizationSupportSuspensionCommands(
	client: SupabaseClient
): OrganizationSupportSuspensionCommands {
	return {
		async suspendOrganization({ organizationId, suspendedBy, reason, suspendedAt }) {
			const outcome = success(
				await client.rpc('platform_suspend_organization', {
					p_actor_user_id: suspendedBy,
					p_organization_id: organizationId,
					p_reason: reason,
					p_suspended_at: suspendedAt.toISOString()
				})
			);
			if (outcome !== 'suspended' && outcome !== 'already_suspended')
				throw new Error('Suspension change could not be confirmed');
			return outcome;
		},
		async unsuspendOrganization({ organizationId, unsuspendedBy }) {
			acknowledgeSuspension(
				await client.rpc('platform_unsuspend_organization', {
					p_actor_user_id: unsuspendedBy,
					p_organization_id: organizationId
				})
			);
		}
	};
}

/** Bound only after platform support admission at the server delivery edge. */
export function createOrganizationSupportReader(client: SupabaseClient): OrganizationSupportReader {
	return {
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
		}
	};
}
