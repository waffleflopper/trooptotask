import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	groupManagementStore as groupsStore,
	groupCatalogHydration,
	groupsStore as groupCatalog
} from './groups.svelte';
import type { Group } from '$features/personnel/contracts';

const mockGroups: Group[] = [
	{ id: '1', name: 'Alpha', sortOrder: 0 },
	{ id: '2', name: 'Bravo', sortOrder: 1 }
];

function mockFetch(response: unknown, status = 200) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(response)
	});
}

describe('groupsStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		groupsStore.load(structuredClone(mockGroups), 'org-1');
	});

	describe('catalog', () => {
		it('shows the Organization catalog in configured order', () => {
			groupCatalogHydration.load(
				[
					{ id: 'later', name: 'Later', sortOrder: 8 },
					{ id: 'first', name: 'First', sortOrder: 1 }
				],
				'org-2'
			);
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['first', 'later']);
		});
		it('clears the public catalog when a new Organization is hydrated', () => {
			groupCatalogHydration.load([{ id: 'new-org', name: 'New', sortOrder: 0 }], 'org-2');
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['new-org']);
		});
	});

	describe('remove', () => {
		it('removes a saved Group from the public catalog', async () => {
			vi.stubGlobal('fetch', mockFetch({}));
			const result = await groupsStore.remove('1');
			expect(result).toBe(true);
			expect(groupCatalog.items.map((group) => group.id)).toEqual(['2']);
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
					{ id: '1', name: 'Alpha', sortOrder: 0 },
					{ id: '2', name: 'Bravo', sortOrder: 4 }
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
			const result = await groupsStore.rename('1', '  bRaVo  ');
			expect(result).toBe(false);
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
