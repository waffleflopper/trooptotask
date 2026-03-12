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
export type PermissionPreset =
	| 'owner'
	| 'admin'
	| 'full-editor'
	| 'team-leader'
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

export function getPermissionPreset(permissions: OrganizationMemberPermissions, scopedGroupId?: string | null): PermissionPreset {
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
		permissions.canViewCalendar && permissions.canEditCalendar &&
		permissions.canViewPersonnel && permissions.canEditPersonnel &&
		permissions.canViewTraining && permissions.canEditTraining &&
		permissions.canViewOnboarding && permissions.canEditOnboarding &&
		permissions.canViewLeadersBook && permissions.canEditLeadersBook
	);
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
	note?: string | null;
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

// ============================================================
// Rating Scheme
// ============================================================

export type ReportType = 'AN' | 'CR' | 'CTR' | 'RFC' | 'SO' | 'EA' | 'RO';

export interface ReportTypeOption {
	value: ReportType;
	label: string;
}

export const OER_REPORT_TYPES: ReportTypeOption[] = [
	{ value: 'AN', label: 'Annual' },
	{ value: 'CR', label: 'Change of Rater' },
	{ value: 'CTR', label: 'Complete the Record' },
	{ value: 'RFC', label: 'Relief for Cause' },
	{ value: 'SO', label: 'Senior Rater Option' },
	{ value: 'EA', label: 'Extended Annual' }
];

export const NCOER_REPORT_TYPES: ReportTypeOption[] = [
	{ value: 'AN', label: 'Annual' },
	{ value: 'CR', label: 'Change of Rater' },
	{ value: 'CTR', label: 'Complete the Record' },
	{ value: 'RFC', label: 'Relief for Cause' },
	{ value: 'EA', label: 'Extended Annual' },
	{ value: 'RO', label: '60-Day Rater Option' },
	{ value: 'SO', label: '60-Day SR Option' }
];

export const WOER_REPORT_TYPES: ReportTypeOption[] = [
	{ value: 'AN', label: 'Annual' },
	{ value: 'CR', label: 'Change of Rater' },
	{ value: 'CTR', label: 'Complete the Record' },
	{ value: 'RFC', label: 'Relief for Cause' },
	{ value: 'SO', label: 'Senior Rater Option' },
	{ value: 'EA', label: 'Extended Annual' }
];

export type WorkflowStatus =
	| 'drafting'
	| 'with-rater'
	| 'rater-signed'
	| 'with-senior-rater'
	| 'sr-signed'
	| 'with-intermediate-rater'
	| 'ir-signed'
	| 'with-reviewer'
	| 'reviewer-signed'
	| 'with-rated-soldier'
	| 'sm-signed'
	| 'submitted-to-s1'
	| 'completed';

export interface WorkflowStatusOption {
	value: WorkflowStatus;
	label: string;
}

export const WORKFLOW_STATUS_OPTIONS: WorkflowStatusOption[] = [
	{ value: 'drafting', label: 'Drafting' },
	{ value: 'with-rater', label: 'With Rater' },
	{ value: 'rater-signed', label: 'Rater Signed' },
	{ value: 'with-senior-rater', label: 'With Senior Rater' },
	{ value: 'sr-signed', label: 'SR Signed' },
	{ value: 'with-intermediate-rater', label: 'With Intermediate Rater' },
	{ value: 'ir-signed', label: 'IR Signed' },
	{ value: 'with-reviewer', label: 'With Reviewer' },
	{ value: 'reviewer-signed', label: 'Reviewer Signed' },
	{ value: 'with-rated-soldier', label: 'With Rated Soldier' },
	{ value: 'sm-signed', label: 'SM Signed' },
	{ value: 'submitted-to-s1', label: 'Submitted to S1' },
	{ value: 'completed', label: 'Completed' }
];

export const WORKFLOW_STATUS_COLORS: Record<WorkflowStatus, string> = {
	drafting: '#6b7280',
	'with-rater': '#3b82f6',
	'rater-signed': '#22c55e',
	'with-senior-rater': '#3b82f6',
	'sr-signed': '#22c55e',
	'with-intermediate-rater': '#3b82f6',
	'ir-signed': '#22c55e',
	'with-reviewer': '#3b82f6',
	'reviewer-signed': '#22c55e',
	'with-rated-soldier': '#8b5cf6',
	'sm-signed': '#22c55e',
	'submitted-to-s1': '#f59e0b',
	completed: '#059669'
};

export interface RatingSchemeEntry {
	id: string;
	ratedPersonId: string;
	evalType: 'OER' | 'NCOER' | 'WOER';
	raterPersonId: string | null;
	raterName: string | null;
	seniorRaterPersonId: string | null;
	seniorRaterName: string | null;
	intermediateRaterPersonId: string | null;
	intermediateRaterName: string | null;
	reviewerPersonId: string | null;
	reviewerName: string | null;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
	status: 'active' | 'completed' | 'change-of-rater';
	notes: string | null;
	reportType: ReportType | null;
	workflowStatus: WorkflowStatus | null;
}

// ============================================================
// Sign-In Rosters
// ============================================================

export interface SignInRoster {
	id: string;
	title: string;
	rosterDate: string | null;
	blankDate: boolean;
	separateByGroup: boolean;
	sortBy: 'alphabetical' | 'rank';
	personnelSnapshot: { id: string; rank: string; lastName: string; firstName: string; group: string }[];
	filterConfig: { groups: string[]; ranks: string[] } | null;
	signedFilePath: string | null;
	createdBy: string;
	createdAt: string;
}

export type RatingDueStatus = 'current' | 'due-60' | 'due-30' | 'overdue' | 'completed';

export const RATING_STATUS_COLORS: Record<RatingDueStatus, string> = {
	current: '#22c55e',
	'due-60': '#eab308',
	'due-30': '#f97316',
	overdue: '#ef4444',
	completed: '#6b7280'
};
