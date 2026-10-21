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
}

/** The counts the nav shows as badges. Each streams on its own, so one failed read leaves the other badge intact. */
export interface SettingsNavCounts {
	pendingInvitations: Promise<number>;
	pendingApprovals: Promise<number>;
}

export const SETTINGS_GROUPS = ['Unit', 'Access', 'Records'] as const;

export interface SettingsPage {
	label: string;
	/** `null` sets the page apart below the groups, as Danger zone is. */
	group: (typeof SETTINGS_GROUPS)[number] | null;
	ownerOnly: boolean;
	/** `form` pages hold rows of settings; `table` pages hold wide lists and get more room. */
	width: 'form' | 'table';
}

/** Every settings page in nav order. Admins do not see owner-only pages; those routes guard themselves. */
export const SETTINGS_PAGES = {
	general: { label: 'General', group: 'Unit', ownerOnly: false, width: 'form' },
	features: { label: 'Features', group: 'Unit', ownerOnly: false, width: 'form' },
	policies: { label: 'Policies', group: 'Unit', ownerOnly: false, width: 'form' },
	ranks: { label: 'Ranks', group: 'Unit', ownerOnly: false, width: 'table' },
	members: { label: 'Members', group: 'Access', ownerOnly: false, width: 'table' },
	approvals: { label: 'Approvals', group: 'Access', ownerOnly: false, width: 'form' },
	archives: { label: 'Archives', group: 'Records', ownerOnly: false, width: 'table' },
	exports: { label: 'Exports', group: 'Records', ownerOnly: false, width: 'form' },
	logs: { label: 'Logs', group: 'Records', ownerOnly: true, width: 'table' },
	danger: { label: 'Danger zone', group: null, ownerOnly: true, width: 'form' }
} as const satisfies Record<string, SettingsPage>;

export type SettingsPageKey = keyof typeof SETTINGS_PAGES;

export function buildSettingsShell(role: MembershipRole, organization: SettingsShellOrganizationSource): SettingsShell {
	const isOwner = role === 'owner';

	return {
		organization: {
			id: organization.id,
			name: organization.name,
			urlSlug: organization.urlSlug,
			urlSegment: organization.urlSegment
		},
		currentMember: {
			role,
			isOwner,
			isAdmin: role === 'admin',
			canManageMembers: isOwner || role === 'admin'
		}
	};
}
