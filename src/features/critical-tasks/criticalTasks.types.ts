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
	mos: string[];
	expirationMonths: number | null;
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
