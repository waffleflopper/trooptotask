import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	groupManagementStore as groupsStore,
	groupCatalogHydration,
	groupsStore as groupCatalog
} from './groups.svelte';
import type { Group } from '$features/personnel/contracts';
import { invalidate } from '$app/navigation';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}) }));

const mockGroups: Group[] = [
	{ id: '1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
	{ id: '2', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 as const }
];

describe('groupsStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.mocked(invalidate).mockClear();
		groupsStore.load(structuredClone(mockGroups), 'org-1');
	});

	describe('catalog', () => {
		it('shows the Organization catalog in configured order', () => {
			groupCatalogHydration.load(
				[
					{ id: 'later', name: 'Later', sortOrder: 8, parentId: null, depth: 1 as const },
					{ id: 'first', name: 'First', sortOrder: 1, parentId: null, depth: 1 as const }
				],
				'org-2'
			);
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['first', 'later']);
		});
		it('breaks equal display positions by name, then id', () => {
			groupCatalogHydration.load(
				[
					{ id: 'a', name: 'Zulu', sortOrder: 0, parentId: null, depth: 1 as const },
					{ id: 'c', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
					{ id: 'b', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
					{ id: 'd', name: 'Earlier', sortOrder: -1, parentId: null, depth: 1 as const }
				],
				'org-1'
			);
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['d', 'b', 'c', 'a']);
		});
		it('clears the public catalog when a new Organization is hydrated', () => {
			groupCatalogHydration.load(
				[{ id: 'new-org', name: 'New', sortOrder: 0, parentId: null, depth: 1 as const }],
				'org-2'
			);
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['new-org']);
		});
	});

	describe('deleteWithReassignment', () => {
		it('deletes the Group in one request naming where its members go and reports how many moved', async () => {
			const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ movedCount: 22 }));
			vi.stubGlobal('fetch', fetchMock);

			await expect(groupsStore.deleteWithReassignment('1', '2')).resolves.toEqual({
				movedCount: 22,
				deletedIds: ['1']
			});
			expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
				['/org/org-1/api/groups', 'DELETE', JSON.stringify({ id: '1', moveMembersTo: '2' })]
			]);
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['2']);
		});

		it('keeps the Group and rejects with the server reason when the delete is refused', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Response.json({ message: 'That Group is no longer available.' }, { status: 404 }))
			);

			await expect(groupsStore.deleteWithReassignment('1', null)).rejects.toThrow('That Group is no longer available.');
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['1', '2']);
		});
	});

	describe('setOrder', () => {
		const orderBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
			fetchMock.mock.calls
				.filter(([url]) => String(url).endsWith('/api/groups/order'))
				.map(([, init]) => JSON.parse((init as RequestInit).body as string));

		it('shows the order while it saves, then keeps it as the saved order', async () => {
			const reply = Promise.withResolvers<Response>();
			const fetchMock = vi.fn(() => reply.promise);
			vi.stubGlobal('fetch', fetchMock);

			const saving = groupsStore.setOrder(['2', '1']);
			expect(groupsStore.pendingOrder).toEqual({ parentId: null, ids: ['2', '1'] });
			reply.resolve(Response.json({ success: true }));

			await expect(saving).resolves.toEqual({ status: 'saved' });
			expect(groupsStore.pendingOrder).toBeNull();
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['2', '1']);
			expect(orderBodies(fetchMock)).toEqual([{ groupIds: ['2', '1'], expectedGroupIds: ['1', '2'], parentId: null }]);
			expect(invalidate).not.toHaveBeenCalled();
		});

		it('folds moves made during a save into one follow-up save of the latest order', async () => {
			groupCatalogHydration.load(
				[...structuredClone(mockGroups), { id: '3', name: 'Charlie', sortOrder: 2, parentId: null, depth: 1 as const }],
				'org-1'
			);
			const first = Promise.withResolvers<Response>();
			const fetchMock = vi
				.fn()
				.mockReturnValueOnce(first.promise)
				.mockResolvedValue(Response.json({ success: true }));
			vi.stubGlobal('fetch', fetchMock);

			const saving = groupsStore.setOrder(['2', '1', '3']);
			void groupsStore.setOrder(['3', '2', '1']);
			void groupsStore.setOrder(['3', '1', '2']);
			first.resolve(Response.json({ success: true }));

			await expect(saving).resolves.toEqual({ status: 'saved' });
			expect(orderBodies(fetchMock)).toEqual([
				{ groupIds: ['2', '1', '3'], expectedGroupIds: ['1', '2', '3'], parentId: null },
				{ groupIds: ['3', '1', '2'], expectedGroupIds: ['2', '1', '3'], parentId: null }
			]);
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['3', '1', '2']);
		});

		it('shows the saved order and says why after another session changed it', async () => {
			const fetchMock = vi.fn(async (url: string) =>
				url.endsWith('/order')
					? Response.json({ message: 'The Group order changed somewhere else.' }, { status: 409 })
					: Response.json([
							{ id: '2', name: 'Bravo', sortOrder: 0, parentId: null, depth: 1 as const },
							{ id: '1', name: 'Alpha', sortOrder: 1, parentId: null, depth: 1 as const },
							{ id: '3', name: 'Charlie', sortOrder: 2, parentId: null, depth: 1 as const }
						])
			);
			vi.stubGlobal('fetch', fetchMock);

			await expect(groupsStore.setOrder(['2', '1'])).resolves.toEqual({
				status: 'failed',
				message: 'The Group order changed somewhere else. The list shows the saved order.'
			});
			expect(groupCatalog.items.map((group) => group.name)).toEqual(['Bravo', 'Alpha', 'Charlie']);
			expect(invalidate).toHaveBeenCalledExactlyOnceWith('app:personnel-data');
		});

		it('orders one sibling set under its parent, after a save in another set settles', async () => {
			groupCatalogHydration.load(
				[
					...structuredClone(mockGroups),
					{ id: 's1', name: '1st Squad', sortOrder: 0, parentId: '1', depth: 2 as const },
					{ id: 's2', name: '2nd Squad', sortOrder: 1, parentId: '1', depth: 2 as const }
				],
				'org-1'
			);
			const first = Promise.withResolvers<Response>();
			const fetchMock = vi
				.fn()
				.mockReturnValueOnce(first.promise)
				.mockResolvedValue(Response.json({ success: true }));
			vi.stubGlobal('fetch', fetchMock);

			void groupsStore.setOrder(['2', '1']);
			const squads = groupsStore.setOrder(['s2', 's1'], '1');
			expect(orderBodies(fetchMock)).toHaveLength(1);
			first.resolve(Response.json({ success: true }));

			await expect(squads).resolves.toEqual({ status: 'saved' });
			expect(orderBodies(fetchMock)).toEqual([
				{ groupIds: ['2', '1'], expectedGroupIds: ['1', '2'], parentId: null },
				{ groupIds: ['s2', 's1'], expectedGroupIds: ['s1', 's2'], parentId: '1' }
			]);
			expect(Object.fromEntries(groupCatalog.items.map((group) => [group.id, group.sortOrder]))).toEqual({
				'1': 1,
				'2': 0,
				s1: 1,
				s2: 0
			});
		});

		it('says an order it could not confirm is unconfirmed and keeps the last saved order', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

			await expect(groupsStore.setOrder(['2', '1'])).resolves.toEqual({
				status: 'failed',
				message: "We couldn't confirm the Group change. Reload to see what saved."
			});
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['1', '2']);
		});
	});

	describe('subtree commands', () => {
		const platoon: Group[] = [
			{ id: 'plt', name: '1st Platoon', sortOrder: 0, parentId: null, depth: 1 as const },
			{ id: 'sq', name: '1st Squad', sortOrder: 0, parentId: 'plt', depth: 2 as const },
			{ id: 'alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'sq', depth: 3 as const },
			{ id: 'bravo', name: 'Bravo Team', sortOrder: 4, parentId: 'sq', depth: 3 as const },
			{ id: 'hq', name: 'HQ Section', sortOrder: 1, parentId: null, depth: 1 as const }
		];
		const shape = () =>
			groupCatalog.items.map((group) => [group.id, group.parentId, group.depth, group.sortOrder] as const);

		beforeEach(() => groupCatalogHydration.load(structuredClone(platoon), 'org-1'));

		it('adds a sub-group after its siblings, one level below its parent', async () => {
			const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
				Response.json({ id: 'charlie', ...JSON.parse(init?.body as string) })
			);
			vi.stubGlobal('fetch', fetchMock);

			await groupsStore.add(' Charlie Team ', 'sq');
			expect(await groupsStore.add('alpha team', 'sq')).toBeNull();
			expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, JSON.parse(init?.body as string)])).toEqual([
				['/org/org-1/api/groups', 'POST', { name: 'Charlie Team', sortOrder: 5, parentId: 'sq', depth: 3 }]
			]);
		});

		it('moves a Group with its sub-groups and shifts their levels', async () => {
			const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
				Response.json({ id: 'sq', name: '1st Squad', sortOrder: 0, parentId: null, depth: 1 })
			);
			vi.stubGlobal('fetch', fetchMock);

			await groupsStore.move('sq', null);
			expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
				['/org/org-1/api/groups', 'PATCH', JSON.stringify({ id: 'sq', parentId: null })]
			]);
			expect(shape()).toEqual([
				['plt', null, 1, 0],
				['sq', null, 1, 0],
				['alpha', 'sq', 2, 0],
				['hq', null, 1, 1],
				['bravo', 'sq', 2, 4]
			]);
		});

		it('keeps the tree and rejects with the server reason when a move is refused', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () =>
					Response.json({ message: 'The parent Group is no longer available. Choose another.' }, { status: 400 })
				)
			);

			await expect(groupsStore.move('sq', 'hq')).rejects.toThrow(
				'The parent Group is no longer available. Choose another.'
			);
			expect(shape()).toEqual([
				['plt', null, 1, 0],
				['sq', 'plt', 2, 0],
				['alpha', 'sq', 3, 0],
				['hq', null, 1, 1],
				['bravo', 'sq', 3, 4]
			]);
		});

		it('drops every Group in a deleted subtree', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Response.json({ movedCount: 5 }))
			);

			await expect(groupsStore.deleteWithReassignment('plt', 'hq')).resolves.toEqual({
				movedCount: 5,
				deletedIds: ['plt', 'sq', 'alpha', 'bravo']
			});
			expect(shape()).toEqual([['hq', null, 1, 1]]);
		});
	});

	describe('add', () => {
		it('should reject duplicate names', async () => {
			const result = await groupsStore.add('Alpha');
			expect(result).toBeNull();
		});

		it('should reject empty names', async () => {
			const result = await groupsStore.add('  ');
			expect(result).toBeNull();
		});

		it('should add with trimmed name', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async (_url, init) => Response.json({ id: '3', ...JSON.parse(init.body), sortOrder: 2 } satisfies Group))
			);

			const result = await groupsStore.add('  Charlie  ');
			expect(result?.name).toBe('Charlie');
			expect(groupCatalog.items.map((group) => group.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
		});

		it('appends after the highest saved position when sort orders have a gap', async () => {
			groupCatalogHydration.load(
				[
					{ id: '1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
					{ id: '2', name: 'Bravo', sortOrder: 4, parentId: null, depth: 1 as const }
				],
				'org-1'
			);
			const fetchMock = vi.fn(async (_url, init) =>
				Response.json({ id: '3', ...JSON.parse(init.body) } satisfies Group)
			);
			vi.stubGlobal('fetch', fetchMock);

			const result = await groupsStore.add('Charlie');
			expect(result?.sortOrder).toBe(5);
			expect(groupCatalog.items.map((group) => group.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
		});
	});

	it('allows a top-level Group to share a sub-group name and limits rename collisions to siblings', async () => {
		groupCatalogHydration.load(
			[
				{ id: 'root', name: 'Platoon', sortOrder: 0, parentId: null, depth: 1 },
				{ id: 'squad-one', name: 'First', sortOrder: 0, parentId: 'root', depth: 2 },
				{ id: 'squad-two', name: 'Second', sortOrder: 1, parentId: 'root', depth: 2 },
				{ id: 'team-one', name: 'Alpha', sortOrder: 0, parentId: 'squad-one', depth: 3 },
				{ id: 'team-two', name: 'Bravo', sortOrder: 1, parentId: 'squad-one', depth: 3 },
				{ id: 'cousin', name: 'Charlie', sortOrder: 0, parentId: 'squad-two', depth: 3 }
			],
			'org-1'
		);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url, init) => {
				const input = JSON.parse(init.body);
				return Response.json({ id: input.id ?? 'new-root', parentId: null, depth: 1, sortOrder: 0, ...input });
			})
		);
		expect((await groupsStore.add('Alpha'))?.id).toBe('new-root');
		expect(await groupsStore.rename('cousin', 'Alpha')).toBe(true);
		await expect(groupsStore.rename('team-two', 'Alpha')).rejects.toThrow();
		expect(groupCatalog.items.find((group) => group.id === 'team-two')?.name).toBe('Bravo');
	});

	describe('rename', () => {
		it('renames a saved Group with a trimmed name in the public catalog', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async (_url, init) => Response.json({ id: '1', ...JSON.parse(init.body), sortOrder: 0 } satisfies Group))
			);

			const result = await groupsStore.rename('1', '  Zulu  ');
			expect(result).toBe(true);
			expect(groupCatalog.items.map((group) => group.name)).toEqual(['Zulu', 'Bravo']);
		});

		it("rejects another Group's name without changing the catalog", async () => {
			await expect(groupsStore.rename('1', '  bRaVo  ')).rejects.toThrow('A Group with that name already exists.');
			expect(groupCatalog.items.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		});

		it('should reject empty name', async () => {
			const result = await groupsStore.rename('1', '  ');
			expect(result).toBe(false);
		});

		it('should reject non-existent ID', async () => {
			const result = await groupsStore.rename('nonexistent', 'Zulu');
			expect(result).toBe(false);
		});
	});
});
