import { describe, expect, it, vi } from 'vitest';
const { createOperations, list } = vi.hoisted(() => ({ createOperations: vi.fn(), list: vi.fn() }));
vi.mock('$features/platform-admin/index.server', () => ({ createPlatformPeopleOperations: createOperations }));
import { load } from './+page.server';

it('admits the request before reading filters', async () => {
	createOperations.mockRejectedValueOnce({ status: 403 });
	const readUrl = vi.fn();
	await expect(
		load({
			get url() {
				return readUrl();
			}
		} as never)
	).rejects.toMatchObject({ status: 403 });
	expect(readUrl).not.toHaveBeenCalled();
});
describe('People list filters', () => {
	it.each([
		['?search=Dana&filter=notSetUp&page=3', { search: 'Dana', filter: 'notSetUp', page: 3, limit: 20 }],
		['?filter=suspended&page=-1', { search: '', filter: 'suspended', page: 1, limit: 20 }],
		['?page=9999999999', { search: '', filter: 'all', page: 2_147_483_647, limit: 20 }],
		['?filter=unexpected&page=2.5', { search: '', filter: 'all', page: 1, limit: 20 }]
	])('passes a normalized query to the paged reader for %s', async (query, expected) => {
		createOperations.mockResolvedValue({ list });
		list.mockResolvedValue({ status: 'ok', data: { people: [], totalCount: 0, page: 1, limit: 20 } });
		const result = await load({
			url: new URL(`https://app.example.test/admin/people${query}`),
			depends: vi.fn()
		} as never);
		expect(list).toHaveBeenLastCalledWith(expected);
		if (!result) throw new Error('Expected directory load');
		await expect(result.people).resolves.toMatchObject({ status: 'ok' });
	});
});
