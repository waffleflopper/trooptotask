import type { Personnel } from '$lib/types';

export const ICT_VALIDATION_METHODS = [
	'Lecture',
	'Demonstration',
	'Practical Exercise',
	'Simulation',
	'Case Study',
	'Discussion',
	'Problem-Based Learning',
	'Role-Playing',
	'Other'
] as const;

export type IctValidationMethod = (typeof ICT_VALIDATION_METHODS)[number];

export interface IctTask {
	id: string;
	taskCode: string;
	title: string;
	description: string | null;
	mos: string[];
	expirationMonths: number | null;
	sortOrder: number;
	archivedAt: string | null;
	createdAt: string;
}

export interface PersonnelIctCompletion {
	id: string;
	personnelId: string;
	ictTaskId: string;
	completedAt: string;
	validationMethod: IctValidationMethod;
	validatedBy: string | null;
	notes: string | null;
	loggedBy: string | null;
	createdAt: string;
}

export interface CriticalTasksSettings {
	defaultExpirationMonths: number;
	expiringSoonWarningDays: number;
}

export interface CriticalTasksSettingsInput {
	defaultExpirationMonths?: number | null;
	expiringSoonWarningDays?: number | null;
}

export type IctStatus = 'current' | 'expiring-soon' | 'expired' | 'not-recorded';

export interface IctStatusInfo {
	status: IctStatus;
	expirationDate: string | null;
	daysUntilExpiration: number | null;
}

export interface CriticalTasksPersonnelHistoryRow {
	completion: PersonnelIctCompletion;
	task: IctTask | null;
	taskCode: string;
	taskTitle: string;
	taskArchivedAt: string | null;
}

export interface CriticalTasksPersonnelHistoryData {
	personnel: Personnel;
	rows: CriticalTasksPersonnelHistoryRow[];
}
