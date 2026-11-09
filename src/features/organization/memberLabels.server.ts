import type { SupabaseClient } from '$lib/server/database';
import { z } from 'zod';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { MemberNameSource, OrganizationMemberLabelRow } from './memberNameTypes';

export type { MemberNameSource, OrganizationMemberLabelRow };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrganizationMemberLabelReader {
	findMembers(orgId: string, userIds: string[]): Promise<OrganizationMemberLabelRow[]>;
}

function compact(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** The name alone, empty when the member has none, so a caller can show the email beside it. */
export function memberNameText(row: Pick<OrganizationMemberLabelRow, 'rank' | 'first_name' | 'last_name'>): string {
	const first = compact(row.first_name);
	const last = compact(row.last_name);
	if (!first && !last) return '';
	return [compact(row.rank), first, last].filter(Boolean).join(' ');
}

export function labelForRow(row: OrganizationMemberLabelRow): string {
	return memberNameText(row) || compact(row.email) || row.user_id;
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

const memberRowSchema = z.object({
	user_id: z.string(),
	rank: z.string().nullable(),
	first_name: z.string().nullable(),
	last_name: z.string().nullable(),
	email: z.string().nullable(),
	name_source: z.enum(['account', 'organization']).nullable()
});

/** One read of the resolver: every member, or only `userIds` when given. */
export async function readOrganizationMemberRows(
	client: SupabaseClient,
	orgId: string,
	userIds?: string[]
): Promise<OrganizationMemberLabelRow[]> {
	const args = userIds ? { p_organization_id: orgId, p_user_ids: userIds } : { p_organization_id: orgId };
	const { data, error } = await selectAllSupabaseRows<unknown>(
		async (from, to) => await client.rpc('organization_member_labels', args).range(from, to)
	);
	if (error) throw new Error((error as { message: string }).message);
	return z.array(memberRowSchema).parse(data);
}

/** Every current member's label, by user id. */
export function createSupabaseOrganizationMemberLabelsReader(
	client: SupabaseClient,
	orgId: string
): () => Promise<Record<string, string>> {
	return async () => {
		const rows = await readOrganizationMemberRows(client, orgId);
		return Object.fromEntries(
			rows.map((row) => {
				const label = labelForRow(row);
				return [row.user_id, label === row.user_id ? `${row.user_id.slice(0, 8)}...` : label];
			})
		);
	};
}
