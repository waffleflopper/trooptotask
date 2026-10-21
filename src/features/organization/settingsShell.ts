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
 * One block of a page's loading skeleton. A `heading` or `strip` after the first block starts a new section, set
 * apart as the pages set their sections apart.
 */
export type SettingsSkeletonBlock =
	/** Settings rows under the page's 2px rule, `height` px each. */
	| { kind: 'facts'; rows: number; height: number; rule?: 'destructive' }
	/** A compact section title over a 2px rule, with a control on the right when `action` is set. */
	| { kind: 'heading'; action?: boolean }
	/** A row of filters above a table. */
	| { kind: 'toolbar' }
	/** A muted strip of inputs, as Members' invite strip. */
	| { kind: 'strip' }
	/** Table rows on 1px rules, `height` px each. */
	| { kind: 'table'; rows: number; height: number };

export interface SettingsPage {
	label: string;
	/** `null` sets the page apart below the groups, as Danger zone is. */
	group: (typeof SETTINGS_GROUPS)[number] | null;
	ownerOnly: boolean;
	/** `form` pages hold rows of settings; `table` pages hold wide lists and get more room. */
	width: 'form' | 'table';
	/** What the shell draws under the page header while the page loads, shaped like the page body. */
	skeleton: readonly SettingsSkeletonBlock[];
}

/** Every settings page in nav order. Admins do not see owner-only pages; those routes guard themselves. */
export const SETTINGS_PAGES = {
	general: {
		label: 'General',
		group: 'Unit',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'facts', rows: 3, height: 104 }]
	},
	features: {
		label: 'Features',
		group: 'Unit',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'facts', rows: 6, height: 104 }]
	},
	policies: {
		label: 'Policies',
		group: 'Unit',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'facts', rows: 4, height: 104 }]
	},
	ranks: {
		label: 'Ranks',
		group: 'Unit',
		ownerOnly: false,
		width: 'table',
		skeleton: [
			{ kind: 'heading', action: true },
			{ kind: 'table', rows: 5, height: 44 },
			{ kind: 'heading' },
			{ kind: 'toolbar' },
			{ kind: 'table', rows: 6, height: 52 }
		]
	},
	members: {
		label: 'Members',
		group: 'Access',
		ownerOnly: false,
		width: 'table',
		skeleton: [{ kind: 'strip' }, { kind: 'heading', action: true }, { kind: 'table', rows: 4, height: 60 }]
	},
	approvals: {
		label: 'Approvals',
		group: 'Access',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'table', rows: 3, height: 72 }]
	},
	archives: {
		label: 'Archives',
		group: 'Records',
		ownerOnly: false,
		width: 'table',
		skeleton: [
			{ kind: 'heading', action: true },
			{ kind: 'table', rows: 4, height: 52 }
		]
	},
	exports: {
		label: 'Exports',
		group: 'Records',
		ownerOnly: false,
		width: 'form',
		skeleton: [{ kind: 'facts', rows: 3, height: 104 }]
	},
	logs: {
		label: 'Logs',
		group: 'Records',
		ownerOnly: true,
		width: 'table',
		skeleton: [{ kind: 'toolbar' }, { kind: 'table', rows: 8, height: 44 }]
	},
	danger: {
		label: 'Danger zone',
		group: null,
		ownerOnly: true,
		width: 'form',
		skeleton: [{ kind: 'facts', rows: 3, height: 104, rule: 'destructive' }]
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
