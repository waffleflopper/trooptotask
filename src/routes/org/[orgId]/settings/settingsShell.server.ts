import type { SettingsNavCounts } from '$features/organization/contracts';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { OrganizationSettingsReader } from '$features/organization/contracts';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';

export function streamSettingsNavCounts(
	ctx: {
		auth: Pick<OrganizationAccessGrant, 'orgId'>;
		organizationSettings: Pick<OrganizationSettingsReader, 'countPendingInvitations'>;
	},
	readPendingApprovals: () => Promise<{ count: number }>
): SettingsNavCounts {
	return {
		pendingInvitations: keepStreamedRejectionObserved(ctx.organizationSettings.countPendingInvitations(ctx.auth.orgId)),
		pendingApprovals: keepStreamedRejectionObserved(readPendingApprovals().then((summary) => summary.count))
	};
}
