import { ORGANIZATION_SORT, parseAdminSort } from '../adminSort';
import type { SupabaseClient } from '$lib/server/database';
import { z } from 'zod';
import {
	PLATFORM_ORGANIZATION_FILTERS,
	PLATFORM_ORGANIZATIONS_MAX_PAGES,
	PLATFORM_ORGANIZATIONS_PAGE_SIZE,
	type PlatformOrganizationDirectory,
	type PlatformOrganizationFilter,
	type PlatformOrganizationListInput,
	type PlatformOrganizationListQuery
} from '../organizationSupportTypes';

const SEARCH_MAX_LENGTH = 100;

export function normalizePlatformOrganizationListQuery(
	input: PlatformOrganizationListInput = {}
): PlatformOrganizationListQuery {
	const pages = Number(input.pages ?? 1);
	const params = new URLSearchParams();
	if (input.sort) params.set('sort', input.sort);
	if (input.dir) params.set('dir', input.dir);
	const filter = (input.filter ?? '').trim().toLowerCase();
	return {
		pages: Number.isInteger(pages) && pages >= 1 ? Math.min(pages, PLATFORM_ORGANIZATIONS_MAX_PAGES) : 1,
		sort: parseAdminSort(ORGANIZATION_SORT, params),
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
				p_sort: query.sort.key,
				p_dir: query.sort.direction,
				p_page: 1,
				p_page_size: query.pages * PLATFORM_ORGANIZATIONS_PAGE_SIZE
			});
			if (error) throw error;
			const rows = z.array(listRow).min(1).parse(data);
			const { total_count: totalCount } = rows[0];
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
				totalCount
			};
		},
		async getOrganization(organizationId) {
			const { data, error } = await client.rpc('platform_organization_detail', { p_organization_id: organizationId });
			if (error) throw error;
			return data === null ? null : detail.parse(data);
		}
	};
}
