import { projectOrganizationAccessGrant } from '../memberAccessProjection';
import type { GroupCoverage, ScopeSet } from '../memberAccessShape';

/** Synthetic SQL result for tests. Omitting coverage models a flat Organization. */
export function groupCoverageForTest(scope: ScopeSet, coveredGroupIds?: readonly string[]): GroupCoverage {
	return projectOrganizationAccessGrant(
		{
			role: 'member',
			member_preset: 'editor',
			access_scope_kind: scope.kind,
			access_scope_group_ids: scope.kind === 'groups' ? scope.groupIds : [],
			covered_group_ids: coveredGroupIds ?? (scope.kind === 'groups' ? scope.groupIds : null)
		},
		'test-user',
		'test-org',
		{ disabledFeatures: [] }
	).scopeSet;
}
