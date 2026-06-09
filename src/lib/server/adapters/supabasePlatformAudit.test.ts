import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformAuditStore } from './supabasePlatformAudit';

function makeDistinctActionsSupabase(
	rows: Array<{ action: string }>,
	error: unknown = null
): {
	supabase: unknown;
	query: {
		select: ReturnType<typeof vi.fn>;
		order: ReturnType<typeof vi.fn>;
		limit: ReturnType<typeof vi.fn>;
		range: ReturnType<typeof vi.fn>;
	};
} {
	const query = {
		select: vi.fn(function select() {
			return query;
		}),
		order: vi.fn(function order() {
			return query;
		}),
		limit: vi.fn(function limit() {
			return query;
		}),
		range: vi.fn(function range() {
			return query;
		}),
		then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
			return Promise.resolve({ data: rows, error }).then(resolve, reject);
		}
	};

	return {
		query,
		supabase: {
			from: vi.fn(() => query)
		}
	};
}

describe('Supabase PlatformAudit adapter', () => {
	it('reads distinct actions with a bounded provider query', async () => {
		const { supabase, query } = makeDistinctActionsSupabase([
			{ action: 'admin.org.gift_tier' },
			{ action: 'admin.user.password_reset' },
			{ action: 'admin.org.gift_tier' }
		]);

		const result = await createSupabasePlatformAuditStore(supabase as never).listDistinctActions();

		expect(result).toEqual(['admin.org.gift_tier', 'admin.user.password_reset']);
		expect(query.limit).toHaveBeenCalledWith(1000);
		expect(query.range).not.toHaveBeenCalled();
	});

	it('surfaces distinct action provider failures', async () => {
		const { supabase } = makeDistinctActionsSupabase([], { message: 'database offline', code: 'XX000' });

		await expect(createSupabasePlatformAuditStore(supabase as never).listDistinctActions()).rejects.toThrow(
			'table audit_logs distinct actions failed: database offline (XX000)'
		);
	});
});
