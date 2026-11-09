import { describe, expect, it } from 'vitest';
import {
	createSupabaseOrganizationMemberLabelsReader,
	labelForRow,
	loadOrganizationMemberLabels,
	memberNameText,
	readOrganizationMemberRows,
	type OrganizationMemberLabelRow
} from './memberLabels.server';

const LEADER = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';

function row(overrides: Partial<OrganizationMemberLabelRow> = {}): OrganizationMemberLabelRow {
	return {
		user_id: LEADER,
		rank: null,
		first_name: null,
		last_name: null,
		email: null,
		name_source: null,
		...overrides
	};
}

describe('a member label', () => {
	it('puts the rank first and trims the parts', () => {
		expect(
			labelForRow(row({ rank: ' SFC ', first_name: ' Dana ', last_name: ' Whitaker ', name_source: 'account' }))
		).toBe('SFC Dana Whitaker');
	});

	it('names a member by either name part without the rank alone standing for a name', () => {
		expect(memberNameText(row({ first_name: 'Dana', name_source: 'account' }))).toBe('Dana');
		expect(memberNameText(row({ rank: 'CPT', last_name: 'Whitaker', name_source: 'organization' }))).toBe(
			'CPT Whitaker'
		);
		expect(memberNameText(row({ rank: 'CPT', name_source: 'account' }))).toBe('');
	});

	it('falls back to the email, then to the user id, when no name is on file', () => {
		expect(labelForRow(row({ rank: 'CPT', email: ' dana@example.test ' }))).toBe('dana@example.test');
		expect(labelForRow(row())).toBe(LEADER);
	});

	it('reads the same whichever source supplied the name', () => {
		const fields = { rank: 'SGT', first_name: 'Jo', last_name: 'Reyes', email: 'jo@example.test' };
		expect(labelForRow(row({ ...fields, name_source: 'account' }))).toBe(
			labelForRow(row({ ...fields, name_source: 'organization' }))
		);
	});
});

describe('Organization member labels', () => {
	it('resolves admitted member names in one scoped read and leaves historical authors unchanged', async () => {
		const requests: Array<{ orgId: string; userIds: string[] }> = [];
		const labels = await loadOrganizationMemberLabels(
			{
				async findMembers(orgId, userIds) {
					requests.push({ orgId, userIds });
					return [
						row({
							user_id: LEADER,
							rank: ' SFC ',
							first_name: ' Dana ',
							last_name: ' Whitaker ',
							email: 'other@example.test',
							name_source: 'account'
						}),
						row({ user_id: SECOND, email: 'second@example.test' })
					];
				}
			},
			'org-1',
			[LEADER, LEADER, SECOND, 'historical author']
		);
		expect(requests).toEqual([{ orgId: 'org-1', userIds: [LEADER, SECOND] }]);
		expect([...labels]).toEqual([
			[LEADER, 'SFC Dana Whitaker'],
			[SECOND, 'second@example.test']
		]);
	});

	it('preserves a contributor identity that has neither a name nor an email', async () => {
		const labels = await loadOrganizationMemberLabels(
			{ findMembers: async () => [row({ user_id: SECOND })] },
			'org-1',
			[SECOND]
		);
		expect(labels.get(SECOND)).toBe(SECOND);
	});
});

function directory(rows: OrganizationMemberLabelRow[], calls: Array<{ fn: string; args: unknown }> = []) {
	return {
		rpc: (fn: string, args: unknown) => {
			calls.push({ fn, args });
			return { range: async (from: number, to: number) => ({ error: null, data: rows.slice(from, to + 1) }) };
		}
	} as never;
}

describe('the member directory read', () => {
	it('uses short IDs only for the Calendar member directory', async () => {
		const read = createSupabaseOrganizationMemberLabelsReader(
			directory([
				row({ rank: 'SFC', first_name: 'Dana', last_name: 'Whitaker', name_source: 'organization' }),
				row({ user_id: SECOND })
			]),
			'org-1'
		);
		expect(await read()).toEqual({ [LEADER]: 'SFC Dana Whitaker', [SECOND]: '22222222...' });
	});

	it('reads members past the first page of the directory', async () => {
		const filler = Array.from({ length: 1000 }, (_, i) =>
			row({
				user_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
				email: `member${i}@example.test`
			})
		);
		const read = createSupabaseOrganizationMemberLabelsReader(
			directory([...filler, row({ rank: 'SFC', first_name: 'Dana', last_name: 'Whitaker', name_source: 'account' })]),
			'org-1'
		);
		expect((await read())[LEADER]).toBe('SFC Dana Whitaker');
	});

	it('asks only for the members it needs when it is given their ids', async () => {
		const calls: Array<{ fn: string; args: unknown }> = [];
		await readOrganizationMemberRows(directory([row()], calls), 'org-1', [LEADER]);
		await readOrganizationMemberRows(directory([row()], calls), 'org-1');
		expect(calls).toEqual([
			{ fn: 'organization_member_labels', args: { p_organization_id: 'org-1', p_user_ids: [LEADER] } },
			{ fn: 'organization_member_labels', args: { p_organization_id: 'org-1' } }
		]);
	});

	it('rejects a row the resolver should never return', async () => {
		await expect(
			readOrganizationMemberRows(directory([{ ...row(), name_source: 'guess' } as never]), 'org-1')
		).rejects.toThrow();
	});
});
