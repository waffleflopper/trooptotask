import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRestAdapter, createMockAdapter } from './ports';
import type { DeleteResult } from '$lib/utils/deletionRequests';

interface TestItem {
	id: string;
	name: string;
}

function mockFetch(response: unknown, status = 200) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(response)
	});
}

describe('createRestAdapter', () => {
	let orgId: string;

	beforeEach(() => {
		vi.restoreAllMocks();
		orgId = 'org-1';
	});

	function makeAdapter() {
		return createRestAdapter<TestItem>(() => orgId, 'test-items');
	}

	describe('create', () => {
		it('should POST to /org/{orgId}/api/{resource} and return created item', async () => {
			const serverItem: TestItem = { id: 'server-1', name: 'Alpha' };
			vi.stubGlobal('fetch', mockFetch(serverItem));

			const adapter = makeAdapter();
			const result = await adapter.create({ name: 'Alpha' });

			expect(result).toEqual(serverItem);
			expect(fetch).toHaveBeenCalledWith('/org/org-1/api/test-items', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Alpha' })
			});
		});

		it('should throw on non-ok response', async () => {
			vi.stubGlobal('fetch', mockFetch({}, 500));

			const adapter = makeAdapter();
			await expect(adapter.create({ name: 'Fail' })).rejects.toThrow();
		});
	});

	describe('update', () => {
		it('should PUT to correct URL with id + data and return updated item', async () => {
			const serverItem: TestItem = { id: '1', name: 'Updated' };
			vi.stubGlobal('fetch', mockFetch(serverItem));

			const adapter = makeAdapter();
			const result = await adapter.update('1', { name: 'Updated' });

			expect(result).toEqual(serverItem);
			expect(fetch).toHaveBeenCalledWith('/org/org-1/api/test-items', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: '1', name: 'Updated' })
			});
		});
	});

	describe('remove', () => {
		it('should DELETE and return deleted on success', async () => {
			vi.stubGlobal('fetch', mockFetch({}));

			const adapter = makeAdapter();
			const result = await adapter.remove('1');

			expect(result).toBe('deleted' satisfies DeleteResult);
			expect(fetch).toHaveBeenCalledWith('/org/org-1/api/test-items', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: '1' })
			});
		});

		it('should return approval_required on 202 with requiresApproval', async () => {
			vi.stubGlobal('fetch', mockFetch({ requiresApproval: true }, 202));

			const adapter = makeAdapter();
			const result = await adapter.remove('1');

			expect(result).toBe('approval_required' satisfies DeleteResult);
		});

		it('should return error on fetch failure', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

			const adapter = makeAdapter();
			const result = await adapter.remove('1');

			expect(result).toBe('error' satisfies DeleteResult);
		});

		it('should return error on non-ok response', async () => {
			vi.stubGlobal('fetch', mockFetch({}, 500));

			const adapter = makeAdapter();
			const result = await adapter.remove('1');

			expect(result).toBe('error' satisfies DeleteResult);
		});
	});
});

describe('createMockAdapter', () => {
	it('should use provided overrides', async () => {
		const adapter = createMockAdapter<TestItem>({
			create: async (data) => ({ id: 'mock-1', ...data }) as TestItem
		});

		const result = await adapter.create({ name: 'Test' });
		expect(result).toEqual({ id: 'mock-1', name: 'Test' });
	});

	it('should throw for non-overridden methods', async () => {
		const adapter = createMockAdapter<TestItem>({});

		await expect(adapter.create({ name: 'Fail' })).rejects.toThrow('not implemented');
		await expect(adapter.update('1', {})).rejects.toThrow('not implemented');
		await expect(adapter.remove('1')).rejects.toThrow('not implemented');
	});
});
