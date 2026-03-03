export interface Personnel {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	mos: string;
	clinicRole: string;
	groupId: string | null;
	groupName: string;
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
	canManageMembers: boolean;
}

export interface OrganizationMember extends OrganizationMemberPermissions {
	id: string;
	organizationId: string;
	userId: string;
	email?: string; // From user lookup or invitation
	role: 'owner' | 'member';
	createdAt: string;
}

export interface OrganizationInvitation {
	id: string;
	organizationId: string;
	email: string;
	status: 'pending' | 'accepted' | 'revoked';
	permissions: OrganizationMemberPermissions;
	createdAt: string;
}

// Preset permission templates for easy assignment
export type PermissionPreset =
	| 'owner'
	| 'admin'
	| 'full-editor'
	| 'calendar-only'
	| 'personnel-only'
	| 'training-only'
	| 'viewer'
	| 'custom';

export const PERMISSION_PRESETS: Record<Exclude<PermissionPreset, 'owner' | 'custom'>, OrganizationMemberPermissions> = {
	admin: {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canManageMembers: true
	},
	'full-editor': {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canManageMembers: false
	},
	'calendar-only': {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canManageMembers: false
	},
	'personnel-only': {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: false,
		canManageMembers: false
	},
	'training-only': {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: true,
		canManageMembers: false
	},
	viewer: {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canManageMembers: false
	}
};

export function getPermissionPreset(permissions: OrganizationMemberPermissions): PermissionPreset {
	// Check each preset
	for (const [preset, presetPermissions] of Object.entries(PERMISSION_PRESETS)) {
		if (
			permissions.canViewCalendar === presetPermissions.canViewCalendar &&
			permissions.canEditCalendar === presetPermissions.canEditCalendar &&
			permissions.canViewPersonnel === presetPermissions.canViewPersonnel &&
			permissions.canEditPersonnel === presetPermissions.canEditPersonnel &&
			permissions.canViewTraining === presetPermissions.canViewTraining &&
			permissions.canEditTraining === presetPermissions.canEditTraining &&
			permissions.canManageMembers === presetPermissions.canManageMembers
		) {
			return preset as PermissionPreset;
		}
	}
	return 'custom';
}

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
}

export interface SpecialDay {
	id: string;
	date: string;
	name: string;
	type: 'federal-holiday' | 'org-closure';
}

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

export const DEFAULT_STATUS_TYPES: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff' },
	{ id: 'school', name: 'School', color: '#4299e1', textColor: '#ffffff' },
	{ id: 'field', name: 'Field/Training', color: '#a0522d', textColor: '#ffffff' },
	{ id: 'tdy', name: 'TDY', color: '#9f7aea', textColor: '#ffffff' },
	{ id: 'appointment', name: 'Appointment', color: '#ed8936', textColor: '#ffffff' },
	{ id: 'sick', name: 'Sick', color: '#e53e3e', textColor: '#ffffff' }
];

export interface TrainingType {
	id: string;
	name: string;
	description: string | null;
	expirationMonths: number | null; // null = never expires (ignored when expirationDateOnly is true)
	warningDaysYellow: number; // default 60
	warningDaysOrange: number; // default 30
	requiredForRoles: string[]; // empty = optional for all
	color: string;
	sortOrder: number;
	expirationDateOnly: boolean; // if true, record stores expiration date directly (no completion date)
}

export interface PersonnelTraining {
	id: string;
	personnelId: string;
	trainingTypeId: string;
	completionDate: string | null; // YYYY-MM-DD, null for never-expires when marked complete without date
	expirationDate: string | null; // calculated or null if never expires
	notes: string | null;
	certificateUrl: string | null;
}

export type TrainingStatus =
	| 'current'
	| 'warning-yellow'
	| 'warning-orange'
	| 'expired'
	| 'not-completed'
	| 'not-required';

export const TRAINING_STATUS_COLORS: Record<TrainingStatus, string> = {
	current: '#22c55e', // green
	'warning-yellow': '#eab308', // yellow
	'warning-orange': '#f97316', // orange
	expired: '#ef4444', // red
	'not-completed': '#6b7280', // gray
	'not-required': '#d1d5db' // light gray
};

// ============================================================
// Onboarding
// ============================================================

export type OnboardingStepType = 'training' | 'paperwork' | 'checkbox';
export type OnboardingStatus = 'in_progress' | 'completed' | 'cancelled';

export interface OnboardingTemplateStep {
	id: string;
	name: string;
	description: string | null;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
}

export interface OnboardingStepNote {
	text: string;
	timestamp: string;
}

export interface OnboardingStepProgress {
	id: string;
	onboardingId: string;
	stepName: string;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
	completed: boolean;
	currentStage: string | null;
	notes: OnboardingStepNote[];
}

export interface PersonnelOnboarding {
	id: string;
	personnelId: string;
	startedAt: string;
	completedAt: string | null;
	status: OnboardingStatus;
	steps: OnboardingStepProgress[];
}
