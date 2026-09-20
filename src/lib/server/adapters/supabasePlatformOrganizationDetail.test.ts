import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabasePlatformOrganizationDetailStore } from './supabasePlatformOrganizationDetail';

const ORGANIZATIONS = [
	{
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Able Company',
		suspended_at: null,
		created_at: '2026-06-01T00:00:00.000Z'
	},
	{
		id: '22222222-2222-4222-8222-222222222222',
		name: 'Baker Company',
		suspended_at: '2026-06-08T16:00:00.000Z',
		created_at: '2026-05-01T00:00:00.000Z'
	}
];

// This provider has only retained organization columns. Commercial reads fail,
// and filtering is evaluated against distinct rows rather than a canned result.
function retainedOrganizationClient(): SupabaseClient {
	return {
		from(table: string) {
			if (table !== 'organizations') throw new Error(`Unavailable table: ${table}`);
			let columns: string[] = [];
			let rows = [...ORGANIZATIONS];
			const query = {
				select(selection: string) {
					columns = selection.split(',').map((column) => column.trim());
					for (const column of columns) {
						if (!(column in ORGANIZATIONS[0])) throw new Error(`Unavailable column: ${column}`);
					}
					return query;
				},
				eq(column: keyof (typeof ORGANIZATIONS)[number], value: string) {
					rows = rows.filter((row) => row[column] === value);
					return query;
				},
				async maybeSingle() {
					if (rows.length > 1) return { data: null, error: new Error('Multiple rows returned') };
					const row = rows[0];
					return {
						data: row ? Object.fromEntries(columns.map((column) => [column, row[column as keyof typeof row]])) : null,
						error: null
					};
				}
			};
			return query;
		}
	} as unknown as SupabaseClient;
}

describe('createSupabasePlatformOrganizationDetailStore', () => {
	it('loads the selected organization using only retained data, without crossing organization IDs', async () => {
		const store = createSupabasePlatformOrganizationDetailStore(retainedOrganizationClient());

		await expect(store.getOrganizationById('22222222-2222-4222-8222-222222222222')).resolves.toEqual({
			id: '22222222-2222-4222-8222-222222222222',
			name: 'Baker Company',
			suspended_at: '2026-06-08T16:00:00.000Z',
			created_at: '2026-05-01T00:00:00.000Z'
		});
		await expect(store.getOrganizationById('missing-organization')).resolves.toBeNull();
	});

	it('does not silently convert provider errors into missing organizations', async () => {
		const providerError = { message: 'database offline', code: 'XX000' };
		const query = {
			select: vi.fn(),
			eq: vi.fn(),
			maybeSingle: vi.fn(async () => ({ data: null, error: providerError }))
		};
		query.select.mockReturnValue(query);
		query.eq.mockReturnValue(query);

		await expect(
			createSupabasePlatformOrganizationDetailStore({
				from: () => query
			} as unknown as SupabaseClient).getOrganizationById('11111111-1111-4111-8111-111111111111')
		).rejects.toBe(providerError);
	});
});
