export interface Personnel {
	id: string;
	slug: string;
	rank: string;
	lastName: string;
	firstName: string;
	mos: string;
	clinicRole: string;
	ets?: string | null;
	deros?: string | null;
	groupId: string | null;
	groupName: string;
	archivedAt?: string | null;
}

export interface PersonnelLookup {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
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
	canViewCriticalTasks: boolean;
	canEditCriticalTasks: boolean;
	canViewOnboarding: boolean;
	canEditOnboarding: boolean;
	canViewRatingScheme?: boolean;
	canEditRatingScheme?: boolean;
	canManageMembers: boolean;
}

export interface OrganizationMember extends OrganizationMemberPermissions {
	id: string;
	organizationId: string;
	userId: string;
	email?: string; // From user lookup or invitation
	role: 'owner' | 'admin' | 'member';
	scopedGroupId: string | null;
	memberPreset?: 'viewer' | 'operator' | 'editor' | string | null;
	capabilityOverrides?: Record<string, unknown> | null;
	accessScopeKind?: 'organization' | 'groups' | string | null;
	accessScopeGroupIds?: string[] | null;
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

export {
	PERMISSION_PRESETS,
	getPermissionPreset,
	isFullEditor,
	resolveRatingSchemePermissions,
	type CurrentPermissionPreset as PermissionPreset
} from '$lib/access/memberAccessShape';

// ============================================================
// Calendar Display Types (shared across features)
// ============================================================

export interface StatusType {
	id: string;
	name: string;
	color: string;
	textColor: string;
	da6AvailabilityTreatment?: Da6AvailabilityTreatment | null;
	da6TreatmentReviewed: boolean;
}

export const DA6_AVAILABILITY_TREATMENTS = ['authorized-absence', 'other-duty', 'misconduct-unavailable'] as const;

export type Da6AvailabilityTreatment = (typeof DA6_AVAILABILITY_TREATMENTS)[number];

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
	showInDateHeader: boolean;
}

export interface DailyAssignment {
	id: string;
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
	dutyRosterTemplateRunId?: string | null;
	dutyRosterTemplateRunRowDate?: string | null;
}

export const DEFAULT_STATUS_TYPES: StatusType[] = [
	{
		id: 'leave',
		name: 'Leave',
		color: '#48bb78',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'authorized-absence',
		da6TreatmentReviewed: true
	},
	{
		id: 'school',
		name: 'School',
		color: '#4299e1',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'authorized-absence',
		da6TreatmentReviewed: true
	},
	{
		id: 'training-tdy',
		name: 'Training / TDY',
		color: '#9f7aea',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'authorized-absence',
		da6TreatmentReviewed: true
	},
	{
		id: 'appointment',
		name: 'Appointment',
		color: '#ed8936',
		textColor: '#ffffff',
		da6AvailabilityTreatment: null,
		da6TreatmentReviewed: true
	},
	{
		id: 'sick',
		name: 'Sick',
		color: '#e53e3e',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'authorized-absence',
		da6TreatmentReviewed: true
	},
	{
		id: 'other-duty',
		name: 'Other Duty / Detail',
		color: '#a0522d',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'other-duty',
		da6TreatmentReviewed: true
	}
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
