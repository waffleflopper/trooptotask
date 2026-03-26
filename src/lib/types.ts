export interface Personnel {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	mos: string;
	clinicRole: string;
	groupId: string | null;
	groupName: string;
	archivedAt?: string | null;
}

// ============================================================
// Organization Member Permissions
// ============================================================

export interface OrganizationMemberPermissions {
	canViewCalendar: boolean;
	canEditCalendar: boolean;
	canViewPersonnel: boolean;
	canEditPersonnel: boolean;
	canViewTraining: boolean;
	canEditTraining: boolean;
	canViewOnboarding: boolean;
	canEditOnboarding: boolean;
	canViewLeadersBook: boolean;
	canEditLeadersBook: boolean;
	canManageMembers: boolean;
}

export interface OrganizationMember extends OrganizationMemberPermissions {
	id: string;
	organizationId: string;
	userId: string;
	email?: string; // From user lookup or invitation
	role: 'owner' | 'admin' | 'member';
	scopedGroupId: string | null;
	createdAt: string;
}

export interface OrganizationInvitation {
	id: string;
	organizationId: string;
	email: string;
	status: 'pending' | 'accepted' | 'revoked';
	permissions: OrganizationMemberPermissions;
	scopedGroupId: string | null;
	createdAt: string;
}

// Preset permission templates for easy assignment
export type PermissionPreset = 'owner' | 'admin' | 'full-editor' | 'team-leader' | 'viewer' | 'custom';

export const PERMISSION_PRESETS: Record<
	Exclude<PermissionPreset, 'owner' | 'custom'>,
	OrganizationMemberPermissions
> = {
	admin: {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: true
	},
	'full-editor': {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: false
	},
	'team-leader': {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: false
	},
	viewer: {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canViewOnboarding: true,
		canEditOnboarding: false,
		canViewLeadersBook: true,
		canEditLeadersBook: false,
		canManageMembers: false
	}
};

export function getPermissionPreset(
	permissions: OrganizationMemberPermissions,
	scopedGroupId?: string | null
): PermissionPreset {
	// Check each preset
	for (const [preset, presetPermissions] of Object.entries(PERMISSION_PRESETS)) {
		if (
			permissions.canViewCalendar === presetPermissions.canViewCalendar &&
			permissions.canEditCalendar === presetPermissions.canEditCalendar &&
			permissions.canViewPersonnel === presetPermissions.canViewPersonnel &&
			permissions.canEditPersonnel === presetPermissions.canEditPersonnel &&
			permissions.canViewTraining === presetPermissions.canViewTraining &&
			permissions.canEditTraining === presetPermissions.canEditTraining &&
			permissions.canViewOnboarding === presetPermissions.canViewOnboarding &&
			permissions.canEditOnboarding === presetPermissions.canEditOnboarding &&
			permissions.canViewLeadersBook === presetPermissions.canViewLeadersBook &&
			permissions.canEditLeadersBook === presetPermissions.canEditLeadersBook &&
			permissions.canManageMembers === presetPermissions.canManageMembers
		) {
			// Distinguish team-leader from full-editor: if member has a scoped group, it's team-leader
			if (preset === 'full-editor' && scopedGroupId) {
				return 'team-leader';
			}
			// Skip team-leader match if no scoped group (it's actually full-editor)
			if (preset === 'team-leader' && !scopedGroupId) {
				continue;
			}
			return preset as PermissionPreset;
		}
	}
	return 'custom';
}

export function isFullEditor(permissions: OrganizationMemberPermissions): boolean {
	return (
		permissions.canViewCalendar &&
		permissions.canEditCalendar &&
		permissions.canViewPersonnel &&
		permissions.canEditPersonnel &&
		permissions.canViewTraining &&
		permissions.canEditTraining &&
		permissions.canViewOnboarding &&
		permissions.canEditOnboarding &&
		permissions.canViewLeadersBook &&
		permissions.canEditLeadersBook
	);
}

// ============================================================
// Calendar Display Types (shared across features)
// ============================================================

export interface StatusType {
	id: string;
	name: string;
	color: string;
	textColor: string;
}

export interface AvailabilityEntry {
	id: string;
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
}

export interface SpecialDay {
	id: string;
	date: string;
	name: string;
	type: 'federal-holiday' | 'org-closure';
}

export interface AssignmentType {
	id: string;
	name: string;
	shortName: string;
	assignTo: 'personnel' | 'group';
	color: string;
	exemptPersonnelIds: string[];
	showInDateHeader?: boolean;
}

export interface DailyAssignment {
	id: string;
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
}

export const DEFAULT_STATUS_TYPES: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff' },
	{ id: 'school', name: 'School', color: '#4299e1', textColor: '#ffffff' },
	{ id: 'field', name: 'Field/Training', color: '#a0522d', textColor: '#ffffff' },
	{ id: 'tdy', name: 'TDY', color: '#9f7aea', textColor: '#ffffff' },
	{ id: 'appointment', name: 'Appointment', color: '#ed8936', textColor: '#ffffff' },
	{ id: 'sick', name: 'Sick', color: '#e53e3e', textColor: '#ffffff' }
];

// ============================================================
// Ranks
// ============================================================

export const ARMY_RANKS = {
	enlisted: ['PV1', 'PV2', 'PFC', 'SPC', 'CPL'],
	nco: ['SGT', 'SSG', 'SFC', 'MSG', '1SG', 'SGM', 'CSM'],
	warrant: ['WO1', 'CW2', 'CW3', 'CW4', 'CW5'],
	officer: ['2LT', '1LT', 'CPT', 'MAJ', 'LTC', 'COL', 'BG', 'MG', 'LTG', 'GEN'],
	civilian: ['CIV']
} as const;

export const ALL_RANKS = [
	...ARMY_RANKS.enlisted,
	...ARMY_RANKS.nco,
	...ARMY_RANKS.warrant,
	...ARMY_RANKS.officer,
	...ARMY_RANKS.civilian
];
