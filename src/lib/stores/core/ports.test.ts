import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequestError, createRestAdapter, rejectedRequestMessage } from './ports';
import type { DeleteResult } from './ports';

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

		it('should surface backend error details on non-ok response', async () => {
			vi.stubGlobal('fetch', mockFetch({ message: 'duplicate key value violates unique constraint' }, 409));

			const adapter = makeAdapter();
			await expect(adapter.create({ name: 'Fail' })).rejects.toThrow('duplicate key value violates unique constraint');
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

describe('rejectedRequestMessage', () => {
	const FALLBACK = 'Failed to save.';
	const failedWith = (status: number, body: string) =>
		buildRequestError(new Response(body, { status }), 'PUT', 'test-items').then((error) =>
			rejectedRequestMessage(error, FALLBACK)
		);

	it("shows the server's reason for a 4xx whose body names one", async () => {
		expect(await failedWith(409, JSON.stringify({ message: 'A Group with that name already exists.' }))).toBe(
			'A Group with that name already exists.'
		);
		expect(await failedWith(400, JSON.stringify('Name is required'))).toBe('Name is required');
	});

	it('falls back for a 4xx without a readable reason, a 5xx and a transport failure', async () => {
		expect(await failedWith(404, '<html>Not Found</html>')).toBe(FALLBACK);
		expect(await failedWith(400, JSON.stringify({}))).toBe(FALLBACK);
		expect(await failedWith(500, JSON.stringify({ message: 'duplicate key value violates unique constraint' }))).toBe(
			FALLBACK
		);
		expect(rejectedRequestMessage(new TypeError('Failed to fetch'), FALLBACK)).toBe(FALLBACK);
	});
});
