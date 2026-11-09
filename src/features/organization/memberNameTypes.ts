/** Where a member's shown name comes from inside an Organization. The account profile outranks the Organization value. */
export type MemberNameSource = 'account' | 'organization';

/** One member as `organization_member_labels` resolves them: the rank and name belong to a single source. */
export interface OrganizationMemberLabelRow {
	user_id: string;
	rank: string | null;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	name_source: MemberNameSource | null;
}
