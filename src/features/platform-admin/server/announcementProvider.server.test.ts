import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabasePlatformAnnouncementsStore } from './announcementProvider.server';

const ANNOUNCEMENT_ID = '11111111-1111-1111-1111-111111111111';

function store(fetchProvider: typeof fetch) {
	return createSupabasePlatformAnnouncementsStore(
		createClient('http://provider.example.test', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: fetchProvider }
		})
	);
}

describe('Platform announcement persistence through the real SDK', () => {
	it.each([true, false])('persists the requested state %s and admitted updater in one update', async (isActive) => {
		const saved = { id: ANNOUNCEMENT_ID, is_active: !isActive, updated_by: null as string | null };
		const methods: string[] = [];
		const provider = store(async (input, init) => {
			const url = new URL(String(input));
			if (url.pathname !== '/rest/v1/platform_announcements' || url.searchParams.get('id') !== `eq.${ANNOUNCEMENT_ID}`)
				throw new Error('Unexpected provider resource');
			methods.push(init?.method ?? 'GET');
			if (init?.method === 'PATCH') Object.assign(saved, JSON.parse(String(init.body)));
			return Response.json([saved]);
		});
		await expect(
			provider.setAnnouncementActive({ id: ANNOUNCEMENT_ID, isActive, updatedBy: 'admitted-admin' })
		).resolves.toEqual({ id: ANNOUNCEMENT_ID, isActive });
		expect(saved).toEqual({ id: ANNOUNCEMENT_ID, is_active: isActive, updated_by: 'admitted-admin' });
		expect(methods).toEqual(['PATCH']);
	});
	it.each([false, true])(
		'leaves a row already stored as %s unchanged when the same state is requested again',
		async (isActive) => {
			const saved = { id: ANNOUNCEMENT_ID, is_active: isActive, updated_by: null as string | null };
			const provider = store(async (_input, init) => {
				if (init?.method === 'PATCH') Object.assign(saved, JSON.parse(String(init.body)));
				return Response.json([saved]);
			});
			for (let attempt = 0; attempt < 2; attempt++)
				await provider.setAnnouncementActive({ id: ANNOUNCEMENT_ID, isActive, updatedBy: 'admitted-admin' });
			expect(saved.is_active).toBe(isActive);
		}
	);
	it('reports a target that does not exist as missing', async () => {
		const provider = store(async () => Response.json([]));
		await expect(
			provider.setAnnouncementActive({ id: ANNOUNCEMENT_ID, isActive: true, updatedBy: 'admitted-admin' })
		).resolves.toBeNull();
	});
	it('rejects a failed update rather than reporting the requested state', async () => {
		const provider = store(async () => Response.json({ message: 'Update unavailable' }, { status: 400 }));
		await expect(
			provider.setAnnouncementActive({ id: ANNOUNCEMENT_ID, isActive: false, updatedBy: 'admitted-admin' })
		).rejects.toThrow('table platform_announcements set active failed');
	});
	it('rejects a later-page failure rather than returning a partial announcement list', async () => {
		const firstPage = Array.from({ length: 1000 }, (_, index) => ({
			id: `notice-${index}`,
			title: 'Notice',
			message: 'Retained content',
			type: 'info',
			is_active: true,
			created_at: '2026-10-01T12:00:00Z',
			expires_at: null
		}));
		const provider = store(async (input) => {
			const url = new URL(String(input));
			return url.searchParams.get('offset') === '1000'
				? Response.json({ message: 'Read unavailable' }, { status: 400 })
				: Response.json(firstPage);
		});
		await expect(provider.listAnnouncements()).rejects.toThrow();
	});
});
