import { describe, it, expect, vi, beforeEach } from 'vitest';
import { statusTypesStore } from './statusTypes.svelte';
import type { StatusType } from '$lib/types';

const mockTypes: StatusType[] = [
	{ id: '1', name: 'Leave', color: '#22c55e', textColor: '#ffffff' },
	{ id: '2', name: 'TDY', color: '#3b82f6', textColor: '#ffffff' }
];

function stubFetch(response: unknown, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(response) })
	);
}

describe('statusTypesStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		statusTypesStore.load(structuredClone(mockTypes), 'org-1');
	});

	describe('list', () => {
		it('returns loaded items', () => {
			expect(statusTypesStore.list).toHaveLength(2);
			expect(statusTypesStore.list[0].name).toBe('Leave');
		});

		it('returns empty array when no items loaded', () => {
			statusTypesStore.load([], 'org-2');
			expect(statusTypesStore.list).toEqual([]);
		});
	});

	describe('load', () => {
		it('replaces existing items with new data', () => {
			statusTypesStore.load([mockTypes[1]], 'org-2');
			expect(statusTypesStore.list).toHaveLength(1);
			expect(statusTypesStore.list[0].name).toBe('TDY');
		});
	});

	describe('getById', () => {
		it('finds a status type by ID', () => {
			const result = statusTypesStore.getById('1');
			expect(result).toEqual(mockTypes[0]);
		});

		it('returns undefined for non-existent ID', () => {
			const result = statusTypesStore.getById('nonexistent');
			expect(result).toBeUndefined();
		});
	});

	describe('add', () => {
		it('adds item and returns the server-created record', async () => {
			const created = { id: 'new-1', name: 'CQ', color: '#ff0000', textColor: '#ffffff' };
			stubFetch(created);

			const result = await statusTypesStore.add({ name: 'CQ', color: '#ff0000', textColor: '#ffffff' });

			expect(result).not.toBeNull();
			expect(result!.id).toBe('new-1');
			expect(statusTypesStore.list.some((s) => s.id === 'new-1')).toBe(true);
		});
	});

	describe('update', () => {
		it('updates an existing item and returns true', async () => {
			stubFetch({ ...mockTypes[0], name: 'Annual Leave' });

			const result = await statusTypesStore.update('1', { name: 'Annual Leave' });

			expect(result).toBe(true);
		});
	});

	describe('remove', () => {
		it('returns boolean true on success (removeBool)', async () => {
			stubFetch({});

			const result = await statusTypesStore.remove('1');

			expect(result).toBe(true);
			expect(typeof result).toBe('boolean');
		});
	});
});
