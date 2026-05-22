import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import type {
	DashboardInvitationAcceptResult,
	DashboardOrgAccessPort,
	DashboardOrganizationSummary,
	DashboardPendingInvitationSummary
} from '$lib/server/core/useCases/dashboardOrgAccess';
import { getPreferredOrganizationUrlSegment } from '$lib/server/core/useCases/organizationUrlSlug';

interface OrganizationMembershipRow {
	organization_id: string;
	role: string;
	organizations: {
		id: string;
		name: string;
		url_slug: string | null;
	} | null;
}

interface OrganizationInvitationSummaryRow {
	id: string;
	organization_id: string;
	created_at: string;
	organizations: {
		id: string;
		name: string;
	} | null;
}

interface AcceptOrganizationInvitationRpcRow {
	accept_status: DashboardInvitationAcceptResult['status'] | null;
	accepted_organization_id: string | null;
}

export function createSupabaseDashboardOrgAccessPort(locals: Pick<App.Locals, 'supabase'>): DashboardOrgAccessPort {
	const supabase = locals.supabase;

	return {
		async listOrganizationsForUser(userId: string): Promise<DashboardOrganizationSummary[]> {
			const { data, error } = await selectAllSupabaseRows<OrganizationMembershipRow>(
				(from, to) =>
					supabase
						.from('organization_memberships')
						.select('organization_id, role, organizations(id, name, url_slug)')
						.eq('user_id', userId)
						.range(from, to) as unknown as Promise<{
						data: OrganizationMembershipRow[] | null;
						error: unknown;
					}>
			);

			if (error || !data) {
				return [];
			}

			return data
				.filter((membership) => membership.organizations)
				.map((membership) => ({
					id: membership.organizations!.id,
					name: membership.organizations!.name,
					role: membership.role,
					urlSegment: getPreferredOrganizationUrlSegment({
						id: membership.organizations!.id,
						urlSlug: membership.organizations!.url_slug
					})
				}));
		},

		async listPendingInvitationsForEmail(email: string): Promise<DashboardPendingInvitationSummary[]> {
			const { data, error } = await selectAllSupabaseRows<OrganizationInvitationSummaryRow>(
				(from, to) =>
					supabase
						.from('organization_invitations')
						.select('id, organization_id, created_at, organizations(id, name)')
						.eq('normalized_email', email)
						.eq('status', 'pending')
						.gt('expires_at', new Date().toISOString())
						.order('created_at', { ascending: false })
						.range(from, to) as unknown as Promise<{
						data: OrganizationInvitationSummaryRow[] | null;
						error: unknown;
					}>
			);

			if (error || !data) {
				return [];
			}

			return data
				.filter((invitation) => invitation.organizations)
				.map((invitation) => ({
					id: invitation.id,
					organizationId: invitation.organization_id,
					organizationName: invitation.organizations!.name,
					createdAt: invitation.created_at
				}));
		},

		async acceptInvitation(input): Promise<DashboardInvitationAcceptResult> {
			const { data, error } = await supabase
				.rpc('accept_organization_invitation', {
					p_invitation_id: input.invitationId
				})
				.single<AcceptOrganizationInvitationRpcRow>();

			if (error || !data) {
				return { status: 'failed', organizationId: null };
			}

			return {
				status: normalizeAcceptStatus(data.accept_status),
				organizationId: data.accepted_organization_id
			};
		},

		async deleteInvitationForEmail(invitationId: string, email: string): Promise<boolean> {
			const { error } = await supabase
				.from('organization_invitations')
				.delete()
				.eq('id', invitationId)
				.eq('normalized_email', email)
				.eq('status', 'pending');

			return !error;
		}
	};
}

function normalizeAcceptStatus(
	status: AcceptOrganizationInvitationRpcRow['accept_status']
): DashboardInvitationAcceptResult['status'] {
	if (
		status === 'accepted' ||
		status === 'not_found' ||
		status === 'expired' ||
		status === 'already_member' ||
		status === 'already_accepted'
	) {
		return status;
	}

	return 'failed';
}
