import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { lastPage } from '$lib/server/supabasePagination.server';
import {
	PLATFORM_ORGANIZATION_FILTERS,
	type PlatformOrganizationDirectory,
	type PlatformOrganizationFilter,
	type PlatformOrganizationListInput,
	type PlatformOrganizationListQuery
} from '../organizationSupportTypes';

export const PLATFORM_ORGANIZATIONS_PAGE_SIZE = 25;
const SEARCH_MAX_LENGTH = 100;

export function normalizePlatformOrganizationListQuery(
	input: PlatformOrganizationListInput = {}
): PlatformOrganizationListQuery {
	const page = Number(input.page ?? 1);
	const filter = (input.filter ?? '').trim().toLowerCase();
	return {
		page: Number.isInteger(page) && page >= 1 ? page : 1,
		q: (input.q ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
		filter: PLATFORM_ORGANIZATION_FILTERS.includes(filter as PlatformOrganizationFilter)
			? (filter as PlatformOrganizationFilter)
			: 'all'
	};
}

const status = z.enum(['active', 'quiet', 'suspended']);
const count = z.coerce.number().int().nonnegative();

const listRow = z.object({
	total_count: count,
	page: z.number().int().positive(),
	all_count: count,
	active_week_count: count,
	quiet_count: count,
	suspended_count: count,
	organization_id: z.string().nullable(),
	name: z.string().nullable(),
	created_at: z.string().nullable(),
	status: status.nullable(),
	last_active_at: z.string().nullable(),
	member_count: count.nullable(),
	personnel_count: count.nullable(),
	owner_count: count.nullable(),
	owner_email: z.string().nullable()
});

const detail = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: z.string(),
	suspendedAt: z.string().nullable(),
	status,
	lastActiveAt: z.string().nullable(),
	personnelCount: count,
	suspension: z
		.object({ reason: z.string(), suspendedAt: z.string(), suspendedByEmail: z.string().nullable() })
		.nullable(),
	members: z.array(
		z.object({
			userId: z.string(),
			email: z.string().nullable(),
			role: z.enum(['owner', 'admin', 'member']),
			lastSignInAt: z.string().nullable()
		})
	),
	invitations: z.array(
		z.object({
			id: z.string(),
			email: z.string(),
			role: z.string(),
			invitedAt: z.string(),
			expiresAt: z.string().nullable()
		})
	)
});

/** Bound after platform admission; the service-role functions read one page or one Organization per call. */
export function createSupabasePlatformOrganizationDirectory(client: SupabaseClient): PlatformOrganizationDirectory {
	return {
		async listOrganizations(query) {
			const { data, error } = await client.rpc('platform_list_organizations', {
				p_search: query.q,
				p_filter: query.filter,
				p_page: query.page,
				p_page_size: PLATFORM_ORGANIZATIONS_PAGE_SIZE
			});
			if (error) throw error;
			const rows = z.array(listRow).min(1).parse(data);
			const { total_count: totalCount, page } = rows[0];
			return {
				counts: {
					all: rows[0].all_count,
					activeWeek: rows[0].active_week_count,
					quiet: rows[0].quiet_count,
					suspended: rows[0].suspended_count
				},
				organizations: rows.flatMap((row) =>
					row.organization_id === null
						? []
						: [
								{
									id: row.organization_id,
									name: row.name ?? '',
									createdAt: row.created_at ?? '',
									status: row.status ?? 'active',
									lastActiveAt: row.last_active_at,
									memberCount: row.member_count ?? 0,
									personnelCount: row.personnel_count ?? 0,
									ownerCount: row.owner_count ?? 0,
									ownerEmail: row.owner_email
								}
							]
				),
				page,
				pageSize: PLATFORM_ORGANIZATIONS_PAGE_SIZE,
				totalCount,
				totalPages: lastPage(totalCount, PLATFORM_ORGANIZATIONS_PAGE_SIZE)
			};
		},
		async getOrganization(organizationId) {
			const { data, error } = await client.rpc('platform_organization_detail', { p_organization_id: organizationId });
			if (error) throw error;
			return data === null ? null : detail.parse(data);
		}
	};
}
