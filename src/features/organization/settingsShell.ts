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

/**
 * One block of a page's loading skeleton, sized from the page at 1440 px. A `heading` or `strip` after the first block
 * starts a new section, 40 px below the one above, as the pages set their sections apart.
 */
export type SettingsSkeletonBlock =
	/** Rows under a 2px rule, one height in px per row; `endRule` closes them as FactSection's does. */
	| { kind: 'rows'; heights: readonly number[]; rule?: 'destructive'; endRule?: boolean }
	/** A compact section title over a 2px rule, with a control on the right when `action` is set. */
	| { kind: 'heading'; action?: boolean }
	/** A row of filters above a list. */
	| { kind: 'toolbar' }
	/** A muted strip of inputs, as Members' invite strip. */
	| { kind: 'strip' }
	/** `rows` rows of `height` px on 1px rules, under a column-header row when `header` is set. */
	| { kind: 'list'; rows: number; height: number; header?: boolean };

export interface SettingsPage {
	label: string;
	/** `null` sets the page apart below the groups, as Danger zone is. */
	group: (typeof SETTINGS_GROUPS)[number] | null;
	ownerOnly: boolean;
	/** `form` pages hold rows of settings; `table` pages hold wide lists and get more room. */
	width: 'form' | 'table';
	/** What the shell draws under the page header while the page loads, shaped like the page body. */
	skeleton: readonly SettingsSkeletonBlock[];
	/** Lines the subtitle wraps to at 1440 px, so the loading header holds the page's height. Two when unset. */
	subtitleLines?: 1;
}

/** Every settings page in nav order. Admins do not see owner-only pages; those routes guard themselves. */
export const SETTINGS_PAGES = {
	general: {
		label: 'General',
		group: 'Unit',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'rows', heights: [137, 137, 136] }]
	},
	features: {
		label: 'Features',
		group: 'Unit',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'rows', heights: [197, 97, 97, 117, 97, 116], endRule: true }]
	},
	policies: {
		label: 'Policies',
		group: 'Unit',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'rows', heights: [169, 169, 168, 53] }]
	},
	ranks: {
		label: 'Ranks',
		group: 'Unit',
		ownerOnly: false,
		width: 'table',
		skeleton: [
			{ kind: 'heading' },
			{ kind: 'list', rows: 6, height: 45 },
			{ kind: 'heading', action: true },
			{ kind: 'toolbar' },
			{ kind: 'list', rows: 5, height: 49, header: true }
		]
	},
	members: {
		label: 'Members',
		group: 'Access',
		ownerOnly: false,
		width: 'table',
		skeleton: [
			{ kind: 'strip' },
			{ kind: 'heading', action: true },
			{ kind: 'list', rows: 8, height: 61, header: true }
		]
	},
	approvals: {
		label: 'Approvals',
		group: 'Access',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'rows', heights: [45, 80, 80] }]
	},
	archives: {
		label: 'Archives',
		group: 'Records',
		ownerOnly: false,
		width: 'table',
		skeleton: [
			{ kind: 'heading', action: true },
			{ kind: 'list', rows: 4, height: 49, header: true }
		]
	},
	exports: {
		label: 'Exports',
		group: 'Records',
		ownerOnly: false,
		width: 'form',
		subtitleLines: 1,
		skeleton: [{ kind: 'rows', heights: [235, 97, 96] }]
	},
	logs: {
		label: 'Logs',
		group: 'Records',
		ownerOnly: true,
		width: 'table',
		skeleton: [{ kind: 'toolbar' }, { kind: 'list', rows: 8, height: 49, header: true }]
	},
	danger: {
		label: 'Danger zone',
		group: null,
		ownerOnly: true,
		width: 'form',
		subtitleLines: 1,
		skeleton: [{ kind: 'rows', heights: [117, 97, 163], rule: 'destructive' }]
	}
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
