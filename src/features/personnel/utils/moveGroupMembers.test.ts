import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveGroupMembers } from './moveGroupMembers';

describe('moveGroupMembers', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('sends one batch write and returns who moved and who could not', async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
			Response.json({ groupId: 'g-2', movedIds: ['a'], unavailableIds: ['b'] })
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(moveGroupMembers('org-1', ['a', 'b'], 'g-2')).resolves.toEqual({
			groupId: 'g-2',
			movedIds: ['a'],
			unavailableIds: ['b']
		});
		expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
			[
				'/org/org-1/api/personnel/group-membership',
				'POST',
				JSON.stringify({ personnelIds: ['a', 'b'], groupId: 'g-2' })
			]
		]);
	});

	it('rejects with the reason a refused write gives, and as unconfirmed for a lost or unreadable reply', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Not allowed' }, { status: 403 }))
		);
		await expect(moveGroupMembers('org-1', ['a'], null)).rejects.toThrow('Not allowed');

		for (const reply of [
			() => Promise.reject(new TypeError('fetch failed')),
			async () => Response.json({ movedIds: ['someone-else'], unavailableIds: [] })
		]) {
			vi.stubGlobal('fetch', vi.fn(reply));
			await expect(moveGroupMembers('org-1', ['a'], null)).rejects.toThrow(
				"We couldn't confirm the Group change. Reload to see what saved."
			);
		}
	});
});
