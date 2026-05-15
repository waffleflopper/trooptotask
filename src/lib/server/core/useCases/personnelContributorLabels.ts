import type { UseCaseContext } from '$lib/server/core/ports';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MembershipContributorRow {
	user_id: string;
	email?: string | null;
	name?: string | null;
	display_name?: string | null;
	full_name?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	username?: string | null;
}

function compact(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function labelForRow(row: MembershipContributorRow): string {
	const fullName =
		compact(row.display_name) ||
		compact(row.full_name) ||
		compact(row.name) ||
		[compact(row.first_name), compact(row.last_name)].filter(Boolean).join(' ');
	return fullName || compact(row.username) || compact(row.email) || row.user_id;
}

export async function loadPersonnelContributorLabels(
	ctx: UseCaseContext,
	contributorIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
	const userIds = [...new Set(contributorIds.filter((id): id is string => !!id && UUID_PATTERN.test(id)))];
	if (userIds.length === 0) return new Map();

	const rows = await (ctx.rawStore ?? ctx.store).findMany<MembershipContributorRow>(
		'organization_memberships',
		ctx.auth.orgId,
		undefined,
		{
			inFilters: { user_id: userIds }
		}
	);

	return new Map(rows.map((row) => [row.user_id, labelForRow(row)]));
}

export function resolveContributorLabel(labels: Map<string, string>, value: string | null | undefined): string {
	if (!value) return 'Unknown leader';
	return labels.get(value) ?? value;
}
