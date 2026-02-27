// ============================================================
// Personnel Extended Info
// ============================================================

export interface PersonnelExtendedInfo {
	id: string;
	personnelId: string;
	emergencyContactName: string | null;
	emergencyContactRelationship: string | null;
	emergencyContactPhone: string | null;
	spouseName: string | null;
	spousePhone: string | null;
	vehicleMakeModel: string | null;
	vehiclePlate: string | null;
	vehicleColor: string | null;
	personalEmail: string | null;
	personalPhone: string | null;
	addressStreet: string | null;
	addressCity: string | null;
	addressState: string | null;
	addressZip: string | null;
	leaderNotes: string | null;
}

// ============================================================
// Counseling Types
// ============================================================

export type CounselingRecurrence = 'none' | 'monthly' | 'quarterly' | 'annually';

export interface CounselingType {
	id: string;
	name: string;
	description: string | null;
	templateContent: string | null;
	templateFilePath: string | null;
	recurrence: CounselingRecurrence;
	color: string;
	isFreeform: boolean;
	sortOrder: number;
}

// ============================================================
// Counseling Records
// ============================================================

export type CounselingStatus = 'draft' | 'completed' | 'acknowledged';

export interface CounselingRecord {
	id: string;
	personnelId: string;
	counselingTypeId: string | null;
	dateConducted: string;
	subject: string;
	keyPoints: string | null;
	planOfAction: string | null;
	notes: string | null;
	filePath: string | null;
	followUpDate: string | null;
	status: CounselingStatus;
	counselorSigned: boolean;
	counselorSignedAt: string | null;
	soldierSigned: boolean;
	soldierSignedAt: string | null;
}

// ============================================================
// Development Goals
// ============================================================

export type GoalStatus = 'not-started' | 'in-progress' | 'completed' | 'on-hold';
export type GoalPriority = 'low' | 'medium' | 'high';
export type GoalCategory = 'career' | 'education' | 'physical' | 'personal';

export interface DevelopmentGoal {
	id: string;
	personnelId: string;
	title: string;
	description: string | null;
	category: GoalCategory;
	priority: GoalPriority;
	status: GoalStatus;
	targetDate: string | null;
	progressNotes: string | null;
}

// ============================================================
// Display Labels
// ============================================================

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
	'not-started': 'Not Started',
	'in-progress': 'In Progress',
	completed: 'Completed',
	'on-hold': 'On Hold'
};

export const GOAL_STATUS_COLORS: Record<GoalStatus, string> = {
	'not-started': '#6b7280',
	'in-progress': '#3b82f6',
	completed: '#22c55e',
	'on-hold': '#f59e0b'
};

export const GOAL_PRIORITY_LABELS: Record<GoalPriority, string> = {
	low: 'Low',
	medium: 'Medium',
	high: 'High'
};

export const GOAL_PRIORITY_COLORS: Record<GoalPriority, string> = {
	low: '#6b7280',
	medium: '#f59e0b',
	high: '#ef4444'
};

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
	career: 'Career',
	education: 'Education',
	physical: 'Physical',
	personal: 'Personal'
};

export const GOAL_CATEGORY_COLORS: Record<GoalCategory, string> = {
	career: '#8b5cf6',
	education: '#3b82f6',
	physical: '#22c55e',
	personal: '#f59e0b'
};

export const COUNSELING_STATUS_LABELS: Record<CounselingStatus, string> = {
	draft: 'Draft',
	completed: 'Completed',
	acknowledged: 'Acknowledged'
};

export const COUNSELING_STATUS_COLORS: Record<CounselingStatus, string> = {
	draft: '#6b7280',
	completed: '#3b82f6',
	acknowledged: '#22c55e'
};

export const COUNSELING_RECURRENCE_LABELS: Record<CounselingRecurrence, string> = {
	none: 'None',
	monthly: 'Monthly',
	quarterly: 'Quarterly',
	annually: 'Annually'
};
