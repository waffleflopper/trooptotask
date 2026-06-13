import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAnnouncementDismissals } from './supabaseAnnouncementDismissals';

const ANNOUNCEMENT_ID = '11111111-1111-1111-1111-111111111111';

function createSupabaseStub(result: { data: unknown; error: unknown }) {
	const upsert = vi.fn().mockResolvedValue(result);
	const from = vi.fn(() => ({ upsert }));
	return { supabase: { from }, from, upsert };
}

describe('createSupabaseAnnouncementDismissals', () => {
	it('upserts the announcement dismissal for the signed-in user', async () => {
		const { supabase, from, upsert } = createSupabaseStub({ data: null, error: null });

		await createSupabaseAnnouncementDismissals({ supabase: supabase as never }).dismiss('user-1', ANNOUNCEMENT_ID);

		expect(from).toHaveBeenCalledWith('announcement_dismissals');
		expect(upsert).toHaveBeenCalledWith({
			announcement_id: ANNOUNCEMENT_ID,
			user_id: 'user-1'
		});
	});

	it('surfaces provider errors from the dismissal upsert', async () => {
		const { supabase } = createSupabaseStub({ data: null, error: { message: 'database offline', code: 'XX000' } });

		await expect(
			createSupabaseAnnouncementDismissals({ supabase: supabase as never }).dismiss('user-1', ANNOUNCEMENT_ID)
		).rejects.toThrow('table announcement_dismissals upsert failed: database offline (XX000)');
	});
});
