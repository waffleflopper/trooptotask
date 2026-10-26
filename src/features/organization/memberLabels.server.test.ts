import { describe, expect, it } from 'vitest';
import { loadOrganizationMemberLabels, createSupabaseOrganizationMemberLabelsReader } from './memberLabels.server';

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

it('formats profile rank and name while preserving unresolved contributor identity', async () => {
	const labels = await loadOrganizationMemberLabels(
		{
			findMembers: async () => [
				{ user_id: LEADER, rank: ' SFC ', first_name: ' Dana ', last_name: ' Whitaker ', email: 'other@example.test' },
				{ user_id: SECOND, rank: 'SGT', email: null }
			]
		},
		'org-1',
		[LEADER, SECOND]
	);
	expect([...labels]).toEqual([
		[LEADER, 'SFC Dana Whitaker'],
		[SECOND, SECOND]
	]);
});

it('uses short IDs only for the Calendar member directory', async () => {
	const read = createSupabaseOrganizationMemberLabelsReader(
		{
			rpc: async () => ({
				error: null,
				data: [
					{ user_id: LEADER, rank: 'SFC', first_name: 'Dana', last_name: 'Whitaker', email: null },
					{ user_id: SECOND, rank: null, first_name: null, last_name: null, email: null }
				]
			})
		} as never,
		'org-1'
	);
	expect(await read()).toEqual({ [LEADER]: 'SFC Dana Whitaker', [SECOND]: '22222222...' });
});
