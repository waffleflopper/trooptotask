import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRankCatalogAdministrationPort } from './supabaseRankCatalogAdministration';

describe('createSupabaseRankCatalogAdministrationPort', () => {
	it('deletes unused rank catalog entries through the atomic RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
		const port = createSupabaseRankCatalogAdministrationPort({ supabase: {} } as never, {
			getAdminClient: () => ({ rpc }) as unknown as SupabaseClient
		});

		await port.deleteRankCatalogEntry('org-1', 'entry-1', 'DET-SGT');

		expect(rpc).toHaveBeenCalledWith('delete_unused_organization_rank_catalog_entry', {
			p_organization_id: 'org-1',
			p_entry_id: 'entry-1',
			p_code: 'DET-SGT'
		});
	});

	it('throws RPC errors', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'Rank is referenced by active Organization data. Retire it instead.' }
		});
		const port = createSupabaseRankCatalogAdministrationPort({ supabase: {} } as never, {
			getAdminClient: () => ({ rpc }) as unknown as SupabaseClient
		});

		await expect(port.deleteRankCatalogEntry('org-1', 'entry-1', 'DET-SGT')).rejects.toThrow(
			'Rank is referenced by active Organization data. Retire it instead.'
		);
	});
});
