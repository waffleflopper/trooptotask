/**
 * Development goal entity — maps `development_goals` (leader's book short/long term goals).
 * Group-scoped via `personnel_id`. `termType` distinguishes short-term from long-term goals.
 */
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';

export interface DevelopmentGoal {
	id: string;
	personnelId: string;
	title: string;
	termType: 'short' | 'long';
	isCompleted: boolean;
	notes: string | null;
}

export const DevelopmentGoalEntity = defineEntity<DevelopmentGoal>({
	table: 'development_goals',
	groupScope: { personnelColumn: 'personnel_id' },
	schema: {
		id: field(z.string(), { readOnly: true }),
		personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true }),
		title: field(z.string()),
		termType: field(z.enum(['short', 'long']), { column: 'term_type' }),
		isCompleted: field(z.boolean(), { column: 'is_completed', insertDefault: false, nullDefault: false }),
		notes: field(z.string().nullable().optional(), { insertDefault: null })
	}
});
