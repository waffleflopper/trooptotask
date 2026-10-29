import { describe, expect, it } from 'vitest';
import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { personnelScopeResource } from './personnelScopeResource';
const groupId = (suffix: number) => `7a510000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
describe('Personnel scope resource', () => {
	it('targets the granted root even when SQL coverage starts with a descendant', () => {
		const scope = groupCoverageForTest({ kind: 'groups', groupIds: [groupId(202)] }, [
			groupId(204),
			groupId(202),
			groupId(205)
		]);
		expect(personnelScopeResource(scope)).toEqual({ kind: 'group', groupId: groupId(202) });
	});
});
