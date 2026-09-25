import { describe, expect, it } from 'vitest';
import { loadOrganizationMemberLabels } from './memberLabels.server';

const LEADER = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';

describe('Organization member labels', () => {
	it('resolves admitted member names in one scoped read and leaves historical authors unchanged', async () => {
		const requests: Array<{ orgId: string; userIds: string[] }> = [];
		const labels = await loadOrganizationMemberLabels(
			{
				async findMembers(orgId, userIds) {
					requests.push({ orgId, userIds });
					return [
						{ user_id: LEADER, display_name: '  1SG Alvarez  ', email: 'different@example.test' },
						{ user_id: SECOND, email: 'second@example.test' }
					];
				}
			},
			'org-1',
			[LEADER, LEADER, SECOND, 'historical author']
		);
		expect(requests).toEqual([{ orgId: 'org-1', userIds: [LEADER, SECOND] }]);
		expect(labels).toEqual(
			new Map([
				[LEADER, '1SG Alvarez'],
				[SECOND, 'second@example.test']
			])
		);
	});
});
