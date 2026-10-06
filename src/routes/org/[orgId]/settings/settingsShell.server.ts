import { countArchivedPersonnel } from '$features/personnel/index.server';
import { buildSettingsShell } from '$features/organization/contracts';
import type { SettingsShellOrganizationSource, SettingsShell } from '$features/organization/contracts';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { OrganizationSettingsReader } from '$features/organization/contracts';

export async function loadSettingsShell(
	ctx: Parameters<typeof countArchivedPersonnel>[0] & {
		auth: Pick<OrganizationAccessGrant, 'orgId' | 'role'>;
		organizationSettings: Pick<OrganizationSettingsReader, 'countPendingInvitations'>;
	},
	organization: SettingsShellOrganizationSource,
	readPendingApprovals: () => Promise<{ count: number }>
): Promise<SettingsShell> {
	const [pendingInvitationsCount, archivedPersonnelCount, pendingApprovals] = await Promise.all([
		ctx.organizationSettings.countPendingInvitations(ctx.auth.orgId),
		countArchivedPersonnel(ctx),
		readPendingApprovals()
	]);
	return buildSettingsShell(ctx.auth.role, organization, {
		pendingInvitationsCount,
		archivedPersonnelCount,
		pendingApprovalsCount: pendingApprovals.count
	});
}
