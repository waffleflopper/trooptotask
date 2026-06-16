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
	['personnel_extended_info', { type: 'personnel', personnelColumn: 'personnel_id' }],
	['personnel_trainings', { type: 'personnel', personnelColumn: 'personnel_id' }],
	['personnel_ict_completions', { type: 'personnel', personnelColumn: 'personnel_id' }],
	['rating_scheme_entries', { type: 'personnel', personnelColumn: 'rated_person_id' }],
	['sign_in_rosters', { type: 'group-array', groupColumn: 'scope_group_ids', requireNonEmpty: true }]
]);
