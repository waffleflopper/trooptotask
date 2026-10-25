export interface TrainingType {
	id: string;
	name: string;
	description: string | null;
	expirationMonths: number | null; // null = never expires (ignored when expirationDateOnly is true)
	warningDaysYellow: number; // default 60
	warningDaysOrange: number; // default 30
	appliesToRoles: string[]; // empty = no role filter (everyone, minus exclusions)
	appliesToMos: string[]; // empty = no MOS filter
	appliesToRanks: string[]; // empty = no rank filter
	excludedRoles: string[];
	excludedMos: string[];
	excludedRanks: string[];
	color: string;
	sortOrder: number;
	expirationDateOnly: boolean; // if true, record stores expiration date directly (no completion date)
	canBeExempted: boolean;
	exemptPersonnelIds: string[];
	isOptional: boolean;
}

export type TrainingRequirementFacts = Omit<TrainingType, 'description' | 'color' | 'sortOrder'>;

export interface PersonnelTraining {
	id: string;
	personnelId: string;
	trainingTypeId: string;
	completionDate: string | null; // YYYY-MM-DD, null for never-expires when marked complete without date
	expirationDate: string | null; // calculated or null if never expires
	notes: string | null;
	certificateUrl: string | null;
}

export type TrainingCompletionFacts = Pick<
	PersonnelTraining,
	'personnelId' | 'trainingTypeId' | 'completionDate' | 'expirationDate'
>;

/** A completion the Person's current record replaced, kept by the `personnel_trainings` history trigger. */
export interface TrainingCompletionHistoryEntry {
	id: string;
	personnelId: string;
	trainingTypeId: string;
	completionDate: string | null;
	expirationDate: string | null;
	notes: string | null;
	certificateUrl: string | null;
	supersededAt: string;
}

export interface TrainingView {
	id: string;
	name: string;
	columnIds: string[];
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export type TrainingStatus =
	| 'current'
	| 'warning-yellow'
	| 'warning-orange'
	| 'expired'
	| 'not-completed'
	| 'not-required'
	| 'exempt';

export const TRAINING_STATUS_COLORS: Record<TrainingStatus, string> = {
	current: '#22c55e',
	'warning-yellow': '#eab308',
	'warning-orange': '#f97316',
	expired: '#ef4444',
	'not-completed': '#6b7280',
	'not-required': '#d1d5db',
	exempt: '#9ca3af'
};
