import type { GroupScopeRule } from '$lib/server/core/ports';

/**
 * Default scope rules for ScopedDataStore.
 * Maps table names to how they relate to personnel groups.
 *
 * - 'group' type: table has a direct group_id column
 * - 'personnel' type: table links to personnel via a personnel_id column
 */
export const defaultScopeRules = new Map<string, GroupScopeRule>([
	['personnel', { type: 'group', groupColumn: 'group_id' }],
	['availability_entries', { type: 'personnel', personnelColumn: 'personnel_id' }],
	['counseling_records', { type: 'personnel', personnelColumn: 'personnel_id' }],
	['development_goals', { type: 'personnel', personnelColumn: 'personnel_id' }],
	['rating_scheme_entries', { type: 'personnel', personnelColumn: 'rated_person_id' }]
]);
