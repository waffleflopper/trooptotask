import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRankCatalogAdministrationPort } from './rankCatalogAdministration.server';

describe('createSupabaseRankCatalogAdministrationPort', () => {
	it('deletes unused rank catalog entries through the atomic RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
		const port = createSupabaseRankCatalogAdministrationPort({
			getAdminClient: () => ({ rpc }) as unknown as SupabaseClient
		});

		await port.deleteRankCatalogEntry('org-1', 'entry-1', 'DET-SGT');

		expect(rpc).toHaveBeenCalledWith('delete_unused_organization_rank_catalog_entry', {
			p_organization_id: 'org-1',
			p_entry_id: 'entry-1',
			p_code: 'DET-SGT'
		});
	});

	it('reports the atomic reference guard as a conflict that advises retirement', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { code: '23503', message: 'Rank is referenced by Organization data. Retire it instead.' }
		});
		const port = createSupabaseRankCatalogAdministrationPort({
			getAdminClient: () => ({ rpc }) as unknown as SupabaseClient
		});

		await expect(port.deleteRankCatalogEntry('org-1', 'entry-1', 'DET-SGT')).rejects.toMatchObject({
			status: 409,
			message: 'Rank is referenced by Organization data. Retire it instead.'
		});
	});

	it.each([
		{ code: '23503', message: 'An unrelated foreign key violation' },
		{ code: 'P0002', message: 'Rank is referenced by Organization data. Retire it instead.' }
	])('does not classify unrelated RPC errors as a reference conflict: $code $message', async (error) => {
		const rpc = vi.fn().mockResolvedValue({ data: null, error });
		const port = createSupabaseRankCatalogAdministrationPort({
			getAdminClient: () => ({ rpc }) as unknown as SupabaseClient
		});

		await expect(port.deleteRankCatalogEntry('org-1', 'entry-1', 'DET-SGT')).rejects.toMatchObject({
			message: error.message
		});
		await expect(port.deleteRankCatalogEntry('org-1', 'entry-1', 'DET-SGT')).rejects.not.toHaveProperty('status');
	});

	it('throws unclassified RPC errors', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'Rank is referenced by Organization data. Retire it instead.' }
		});
		const port = createSupabaseRankCatalogAdministrationPort({
			getAdminClient: () => ({ rpc }) as unknown as SupabaseClient
		});

		await expect(port.deleteRankCatalogEntry('org-1', 'entry-1', 'DET-SGT')).rejects.toThrow(
			'Rank is referenced by Organization data. Retire it instead.'
		);
	});
});
