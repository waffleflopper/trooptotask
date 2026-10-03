import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { listOrganizationMemberEmailsByUserIds, loadOrganizationMemberLabels } from './memberLabels.server';

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

	it('returns only referenced Organization emails exactly as stored with no name or user-ID fallback', async () => {
		const store = createInMemoryDataStore();
		store.seed('organization_memberships', [
			{
				id: 'm1',
				organization_id: 'org-1',
				user_id: 'referenced',
				email: '  Owner@Example.COM  ',
				name: 'Ignored Name'
			},
			{ id: 'm2', organization_id: 'org-1', user_id: 'empty', email: '', name: 'No Name Fallback' },
			{ id: 'm3', organization_id: 'org-1', user_id: 'null-email', email: null },
			{ id: 'm4', organization_id: 'org-1', user_id: 'whitespace', email: '  ' },
			{ id: 'm5', organization_id: 'org-1', user_id: 'unrequested', email: 'unrequested@example.com' },
			{ id: 'm6', organization_id: 'org-2', user_id: 'referenced', email: 'foreign-membership@example.com' },
			{ id: 'm7', organization_id: 'org-2', user_id: 'foreign-only', email: 'foreign-only@example.com' }
		]);

		expect(
			await listOrganizationMemberEmailsByUserIds(store, 'org-1', [
				'referenced',
				'empty',
				'null-email',
				'whitespace',
				'foreign-only',
				'missing'
			])
		).toEqual(
			new Map([
				['referenced', '  Owner@Example.COM  '],
				['whitespace', '  ']
			])
		);
	});

	it('returns no membership emails without accessing persistence when no user IDs are referenced', async () => {
		await expect(
			listOrganizationMemberEmailsByUserIds(
				{
					async findMany() {
						throw new Error('Persistence is unavailable');
					}
				},
				'org-1',
				[]
			)
		).resolves.toEqual(new Map());
	});
});
