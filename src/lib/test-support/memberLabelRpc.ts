type Row = Record<string, unknown>;

/**
 * What `organization_member_labels` answers for a fake transport: the account profile when it has a first or last
 * name, else the Organization's own value on the membership, else no name. The rank travels with the name.
 */
export function memberLabelRpcRows(
	memberships: readonly Row[],
	profiles: readonly Row[],
	body: { p_organization_id: string; p_user_ids?: string[] | null }
): Row[] {
	return memberships
		.filter(
			(row) =>
				row.organization_id === body.p_organization_id &&
				(!body.p_user_ids || body.p_user_ids.includes(String(row.user_id)))
		)
		.map((row) => {
			const profile = profiles.find((candidate) => candidate.user_id === row.user_id);
			const account = Boolean(profile?.first_name || profile?.last_name);
			const organization = Boolean(row.org_first_name || row.org_last_name);
			const source = account
				? { rank: profile?.rank, first: profile?.first_name, last: profile?.last_name }
				: organization
					? { rank: row.org_rank, first: row.org_first_name, last: row.org_last_name }
					: { rank: null, first: null, last: null };
			return {
				user_id: row.user_id,
				rank: source.rank ?? null,
				first_name: source.first ?? null,
				last_name: source.last ?? null,
				email: row.email ?? null,
				name_source: account ? 'account' : organization ? 'organization' : null
			};
		});
}
