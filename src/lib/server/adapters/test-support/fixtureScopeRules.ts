import type { FixtureGroupScopeRule } from './inMemoryRows.types';

export const fixtureScopeRules = new Map<string, FixtureGroupScopeRule>([
	['personnel', { type: 'group', groupColumn: 'group_id' }],
	['availability_entries', { type: 'personnel', personnelColumn: 'personnel_id' }],
	['counseling_records', { type: 'personnel', personnelColumn: 'personnel_id' }],
	['personnel_extended_info', { type: 'personnel', personnelColumn: 'personnel_id' }]
]);
