export interface Personnel {
	id: string;
	slug?: string;
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

export interface OrganizationMember {
	id: string;
	organizationId: string;
	userId: string;
	email?: string; // From user lookup or invitation
	role: 'owner' | 'admin' | 'member';
	canManageMembers: boolean;
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
	createdAt: string;
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
	textColor?: string;
	exemptPersonnelIds: string[];
	showInDateHeader: boolean;
	archivedAt?: string | null;
}

export interface DailyAssignment {
	id: string;
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
}

export const DEFAULT_STATUS_TYPES: StatusType[] = [
	{
		id: 'leave',
		name: 'Leave',
		color: '#48bb78',
		textColor: '#ffffff'
	},
	{
		id: 'school',
		name: 'School',
		color: '#4299e1',
		textColor: '#ffffff'
	},
	{
		id: 'training-tdy',
		name: 'Training / TDY',
		color: '#9f7aea',
		textColor: '#ffffff'
	},
	{
		id: 'appointment',
		name: 'Appointment',
		color: '#ed8936',
		textColor: '#ffffff'
	},
	{
		id: 'sick',
		name: 'Sick',
		color: '#e53e3e',
		textColor: '#ffffff'
	},
	{
		id: 'other-duty',
		name: 'Other Duty / Detail',
		color: '#a0522d',
		textColor: '#ffffff'
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
