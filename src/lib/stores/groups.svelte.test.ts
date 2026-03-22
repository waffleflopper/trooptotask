import { describe, it, expect, vi, beforeEach } from 'vitest';
import { groupsStore, type Group } from './groups.svelte';

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

	describe('list', () => {
		it('returns loaded items', () => {
			expect(groupsStore.list).toHaveLength(2);
			expect(groupsStore.list[0].name).toBe('Alpha');
		});

		it('returns empty array when no items loaded', () => {
			groupsStore.load([], 'org-2');
			expect(groupsStore.list).toEqual([]);
		});
	});

	describe('load', () => {
		it('replaces existing items with new data', () => {
			groupsStore.load([{ id: '9', name: 'Zulu', sortOrder: 0 }], 'org-2');
			expect(groupsStore.list).toHaveLength(1);
			expect(groupsStore.list[0].name).toBe('Zulu');
		});
	});

	describe('remove', () => {
		it('returns boolean true on success', async () => {
			vi.stubGlobal('fetch', mockFetch({}));
			const result = await groupsStore.remove('1');
			expect(result).toBe(true);
			expect(typeof result).toBe('boolean');
		});
	});

	describe('getById', () => {
		it('should find a group by ID', () => {
			expect(groupsStore.getById('1')?.name).toBe('Alpha');
		});
	});

	describe('getByName', () => {
		it('should find a group by name case-insensitively', () => {
			expect(groupsStore.getByName('alpha')?.id).toBe('1');
		});
	});

	describe('names', () => {
		it('should return array of group names', () => {
			expect(groupsStore.names).toEqual(['Alpha', 'Bravo']);
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
			const serverGroup: Group = { id: '3', name: 'Charlie', sortOrder: 2 };
			vi.stubGlobal('fetch', mockFetch(serverGroup));

			const result = await groupsStore.add('  Charlie  ');
			expect(result).toEqual(serverGroup);
		});
	});

	describe('rename', () => {
		it('should rename a group', async () => {
			vi.stubGlobal('fetch', mockFetch({}));

			const result = await groupsStore.rename('1', 'Zulu');
			expect(result).toBe(true);
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
