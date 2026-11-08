import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveGroupMembers, undoGroupMoves } from './moveGroupMembers';

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

describe('undoGroupMoves', () => {
	afterEach(() => vi.unstubAllGlobals());
	const moves = [
		{ personnelId: 'a', fromGroupId: 'g-2', toGroupId: 'g-1' },
		{ personnelId: 'b', fromGroupId: 'g-2', toGroupId: null }
	];

	it('sends the pairs in one request and returns who was put back and who changed since', async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
			Response.json({ restoredIds: ['a'], changedIds: ['b'] })
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(undoGroupMoves('org-1', moves)).resolves.toEqual({ restoredIds: ['a'], changedIds: ['b'] });
		expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
			['/org/org-1/api/personnel/group-membership/undo', 'POST', JSON.stringify({ moves })]
		]);
	});

	it('rejects with the reason a refused request gives, and as unconfirmed for a lost or foreign reply', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Not allowed' }, { status: 403 }))
		);
		await expect(undoGroupMoves('org-1', moves)).rejects.toThrow('Not allowed');

		for (const reply of [
			() => Promise.reject(new TypeError('fetch failed')),
			async () => Response.json({ restoredIds: ['someone-else'], changedIds: [] })
		]) {
			vi.stubGlobal('fetch', vi.fn(reply));
			await expect(undoGroupMoves('org-1', moves)).rejects.toThrow(
				"We couldn't confirm the Group change. Reload to see what saved."
			);
		}
	});
});
