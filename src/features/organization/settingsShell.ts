import type { MembershipRole } from '$lib/access/memberAccessShape';

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

export function buildSettingsShell(
	role: MembershipRole,
	organization: SettingsShellOrganizationSource,
	counts: SettingsShell['navBadges']
): SettingsShell {
	const isOwner = role === 'owner';
	const canManageMembers = isOwner || role === 'admin';

	return {
		organization: {
			id: organization.id,
			name: organization.name,
			urlSlug: organization.urlSlug,
			urlSegment: organization.urlSegment
		},
		currentMember: {
			role: role,
			isOwner,
			isAdmin: role === 'admin',
			canManageMembers
		},
		tabVisibility: {
			general: true,
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
			pendingInvitationsCount: counts.pendingInvitationsCount,
			archivedPersonnelCount: counts.archivedPersonnelCount,
			pendingApprovalsCount: counts.pendingApprovalsCount
		}
	};
}
