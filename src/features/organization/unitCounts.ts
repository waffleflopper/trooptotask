export const UNIT_COUNT_KEYS = [
	'activePersonnel',
	'archivedPersonnel',
	'members',
	'statusTypes',
	'assignmentTypes',
	'specialDays',
	'trainingTypes',
	'trainingRecords',
	'criticalTaskLists',
	'ratingSchemeEntries',
	'onboardingTemplates',
	'calendarEvents'
] as const;

export type UnitCountKey = (typeof UNIT_COUNT_KEYS)[number];

/** Exactly the requested keys, each a whole-unit total. */
export type UnitCounts<K extends UnitCountKey> = { [P in K]: number };

/** `archived` narrows a table with an `archived_at` column; leave it out to count every row. */
export interface UnitCountRowSource {
	table: string;
	archived?: boolean;
}

/** One table and predicate per key, shared by every adapter. Rating Scheme entries come from their owner. */
export const UNIT_COUNT_ROW_SOURCES = {
	activePersonnel: { table: 'personnel', archived: false },
	archivedPersonnel: { table: 'personnel', archived: true },
	members: { table: 'organization_memberships' },
	statusTypes: { table: 'status_types' },
	assignmentTypes: { table: 'assignment_types', archived: false },
	specialDays: { table: 'special_days' },
	trainingTypes: { table: 'training_types' },
	trainingRecords: { table: 'personnel_trainings' },
	criticalTaskLists: { table: 'ict_tasks', archived: false },
	onboardingTemplates: { table: 'onboarding_templates' },
	calendarEvents: { table: 'calendar_events' }
} as const satisfies Record<Exclude<UnitCountKey, 'ratingSchemeEntries'>, UnitCountRowSource>;
