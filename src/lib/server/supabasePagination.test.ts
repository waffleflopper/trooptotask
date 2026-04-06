import { describe, expect, it, vi } from 'vitest';
import { selectAllSupabaseRows } from './supabasePagination';

describe('selectAllSupabaseRows', () => {
	it('combines paged results until the final short page', async () => {
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 })), error: null })
			.mockResolvedValueOnce({ data: [{ id: 1001 }, { id: 1002 }], error: null });

		const result = await selectAllSupabaseRows(fetchPage);

		expect(result.error).toBeNull();
		expect(result.data).toHaveLength(1002);
		expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 999);
		expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
	});

	it('preserves count from paged count-bearing queries', async () => {
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({
				data: Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 })),
				error: null,
				count: 1002
			})
			.mockResolvedValueOnce({ data: [{ id: 1001 }, { id: 1002 }], error: null, count: 1002 });

		const result = await selectAllSupabaseRows(fetchPage);

		expect(result.count).toBe(1002);
		expect(result.data).toHaveLength(1002);
	});

	it('returns query errors without swallowing them', async () => {
		const failure = { message: 'query failed' };
		const fetchPage = vi.fn().mockResolvedValueOnce({ data: null, error: failure, count: null });

		const result = await selectAllSupabaseRows(fetchPage);

		expect(result.data).toBeNull();
		expect(result.error).toBe(failure);
	});
});
