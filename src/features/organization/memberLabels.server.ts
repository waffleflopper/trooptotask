import type { SupabaseClient } from '$lib/server/database';
import { z } from 'zod';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrganizationMemberLabelRow {
	user_id: string;
	rank?: string | null;
	email?: string | null;
	name?: string | null;
	display_name?: string | null;
	full_name?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	username?: string | null;
}

export interface OrganizationMemberLabelReader {
	findMembers(orgId: string, userIds: string[]): Promise<OrganizationMemberLabelRow[]>;
}

function compact(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function labelForRow(row: OrganizationMemberLabelRow): string {
	const fullName =
		compact(row.display_name) ||
		compact(row.full_name) ||
		compact(row.name) ||
		([compact(row.first_name), compact(row.last_name)].some(Boolean)
			? [compact(row.rank), compact(row.first_name), compact(row.last_name)].filter(Boolean).join(' ')
			: '');
	return fullName || compact(row.username) || compact(row.email) || row.user_id;
}

export async function loadOrganizationMemberLabels(
	reader: OrganizationMemberLabelReader,
	orgId: string,
	contributorIds: string[]
): Promise<Map<string, string>> {
	const userIds = [...new Set(contributorIds.filter((id) => UUID_PATTERN.test(id)))];
	if (userIds.length === 0) return new Map();
	const rows = await reader.findMembers(orgId, userIds);
	return new Map(rows.map((row) => [row.user_id, labelForRow(row)]));
}

/** Every current member's label, by user id. */
export function createSupabaseOrganizationMemberLabelsReader(
	client: SupabaseClient,
	orgId: string
): () => Promise<Record<string, string>> {
	return async () => {
		const { data, error } = await selectAllSupabaseRows<unknown>(
			async (from, to) => await client.rpc('organization_member_labels', { p_organization_id: orgId }).range(from, to)
		);
		if (error) throw new Error((error as { message: string }).message);
		const rows = z
			.array(
				z.object({
					user_id: z.string(),
					rank: z.string().nullable(),
					first_name: z.string().nullable(),
					last_name: z.string().nullable(),
					email: z.string().nullable()
				})
			)
			.parse(data);
		return Object.fromEntries(
			rows.map((row) => {
				const label = labelForRow(row);
				return [row.user_id, label === row.user_id ? `${row.user_id.slice(0, 8)}...` : label];
			})
		);
	};
}
