import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { UseCaseContext } from '$lib/server/core/ports';

export interface SettingsShellOrganizationSource {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
}

export interface SettingsShell {
	organization: {
		id: string;
		name: string | null;
		urlSlug: string | null;
		urlSegment: string;
	};
	currentMember: {
		role: MembershipRole;
		isOwner: boolean;
		isAdmin: boolean;
		canManageMembers: boolean;
	};
	tabVisibility: {
		general: true;
		billing: true;
		members: true;
		policies: true;
		ranks: true;
		archives: true;
		approvals: true;
		logs: boolean;
		exports: true;
		danger: boolean;
	};
	navBadges: {
		pendingInvitationsCount: number;
		archivedPersonnelCount: number;
		pendingApprovalsCount: number;
	};
}

export async function loadSettingsShell(
	ctx: Pick<UseCaseContext, 'auth' | 'store'>,
	organization: SettingsShellOrganizationSource
): Promise<SettingsShell> {
	const [pendingInvitations, archivedPersonnel, pendingApprovals] = await Promise.all([
		ctx.store.findManyWithCount(
			'organization_invitations',
			ctx.auth.orgId,
			{ status: 'pending' },
			{ select: 'id', limit: 0 }
		),
		ctx.store.findManyWithCount('personnel', ctx.auth.orgId, undefined, {
			select: 'id',
			isNull: { archived_at: false },
			limit: 0
		}),
		ctx.store.findManyWithCount('deletion_requests', ctx.auth.orgId, { status: 'pending' }, { select: 'id', limit: 0 })
	]);
	const isOwner = ctx.auth.role === 'owner';
	const canManageMembers = isOwner || ctx.auth.role === 'admin';

	return {
		organization: {
			id: organization.id,
			name: organization.name,
			urlSlug: organization.urlSlug,
			urlSegment: organization.urlSegment
		},
		currentMember: {
			role: ctx.auth.role,
			isOwner,
			isAdmin: ctx.auth.role === 'admin',
			canManageMembers
		},
		tabVisibility: {
			general: true,
			billing: true,
			members: true,
			policies: true,
			ranks: true,
			archives: true,
			approvals: true,
			logs: isOwner,
			exports: true,
			danger: isOwner
		},
		navBadges: {
			pendingInvitationsCount: pendingInvitations.count ?? 0,
			archivedPersonnelCount: archivedPersonnel.count ?? 0,
			pendingApprovalsCount: pendingApprovals.count ?? 0
		}
	};
}
