import { countArchivedPersonnel } from '$features/personnel/index.server';
import { buildSettingsShell } from '$features/organization/contracts';
import type { SettingsShellOrganizationSource, SettingsShell } from '$features/organization/contracts';
import type { UseCaseContext } from '$lib/server/core/ports';

export async function loadSettingsShell(
	ctx: Pick<UseCaseContext, 'auth' | 'store' | 'organizationSettings'>,
	organization: SettingsShellOrganizationSource
): Promise<SettingsShell> {
	const [pendingInvitationsCount, archivedPersonnelCount, pendingApprovals] = await Promise.all([
		ctx.organizationSettings.countPendingInvitations(ctx.auth.orgId),
		countArchivedPersonnel(ctx),
		ctx.store.findManyWithCount('deletion_requests', ctx.auth.orgId, { status: 'pending' }, { select: 'id', limit: 0 })
	]);
	return buildSettingsShell(ctx.auth.role, organization, {
		pendingInvitationsCount,
		archivedPersonnelCount,
		pendingApprovalsCount: pendingApprovals.count ?? 0
	});
}
