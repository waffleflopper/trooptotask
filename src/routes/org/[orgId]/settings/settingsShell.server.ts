import { countArchivedPersonnel } from '$features/personnel/index.server';
import { buildSettingsShell } from '$features/organization/contracts';
import type { SettingsShellOrganizationSource, SettingsShell } from '$features/organization/contracts';
import type { UseCaseContext } from '$lib/server/core/ports';

export async function loadSettingsShell(
	ctx: Pick<UseCaseContext, 'auth' | 'store' | 'organizationSettings'>,
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
