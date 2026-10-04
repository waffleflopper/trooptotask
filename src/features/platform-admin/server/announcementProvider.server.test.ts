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
	it('persists the toggled state and admitted updater before reporting success', async () => {
		const saved = { id: ANNOUNCEMENT_ID, is_active: false, updated_by: null as string | null };
		const provider = store(async (input, init) => {
			const url = new URL(String(input));
			if (url.pathname !== '/rest/v1/platform_announcements' || url.searchParams.get('id') !== `eq.${ANNOUNCEMENT_ID}`)
				throw new Error('Unexpected provider resource');
			if (init?.method === 'PATCH') Object.assign(saved, JSON.parse(String(init.body)));
			return Response.json([saved]);
		});
		await expect(
			provider.toggleAnnouncementActive({ id: ANNOUNCEMENT_ID, updatedBy: 'admitted-admin' })
		).resolves.toEqual({ id: ANNOUNCEMENT_ID, isActive: true });
		expect(saved).toEqual({ id: ANNOUNCEMENT_ID, is_active: true, updated_by: 'admitted-admin' });
	});
	it('reports a target that disappeared before the update acknowledgement as missing', async () => {
		const provider = store(async (_input, init) =>
			Response.json(init?.method === 'PATCH' ? [] : [{ id: ANNOUNCEMENT_ID, is_active: false }])
		);
		await expect(
			provider.toggleAnnouncementActive({ id: ANNOUNCEMENT_ID, updatedBy: 'admitted-admin' })
		).resolves.toBeNull();
	});
	it('does not attempt an update when the target is already missing', async () => {
		const writes: unknown[] = [];
		const provider = store(async (_input, init) => {
			if (init?.method === 'PATCH') writes.push(init.body);
			return Response.json([]);
		});
		await expect(
			provider.toggleAnnouncementActive({ id: ANNOUNCEMENT_ID, updatedBy: 'admitted-admin' })
		).resolves.toBeNull();
		expect(writes).toEqual([]);
	});
	it('does not attempt an update when reading its target fails', async () => {
		const writes: unknown[] = [];
		const provider = store(async (_input, init) => {
			if (init?.method === 'PATCH') writes.push(init.body);
			return Response.json({ message: 'Read unavailable' }, { status: 400 });
		});
		await expect(
			provider.toggleAnnouncementActive({ id: ANNOUNCEMENT_ID, updatedBy: 'admitted-admin' })
		).rejects.toThrow();
		expect(writes).toEqual([]);
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
