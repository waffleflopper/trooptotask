import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createPlatformAnnouncements } from './announcements.server';
import { createSupabasePlatformAnnouncementsStore } from './announcementProvider.server';
import { createFeedbackReview, createSupabaseFeedbackReviewStore } from '$features/feedback/index.server';

function client(fetchProvider: typeof fetch) {
	return createClient('http://provider.example.test', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetchProvider }
	});
}

function announcements(provider: ReturnType<typeof client>) {
	return createPlatformAnnouncements({
		store: createSupabasePlatformAnnouncementsStore(provider),
		actorUserId: 'admin',
		audit: () => {}
	});
}

describe('platform content provider contracts through the real SDK', () => {
	it('does not report a failed announcement read as an empty collection', async () => {
		const provider = client(async () =>
			Response.json({ message: 'Read unavailable' }, { status: 503, headers: { 'Retry-After': '0' } })
		);
		await expect(announcements(provider).list()).rejects.toThrow();
	});

	it('does not report a failed Feedback read as an empty collection', async () => {
		const provider = client(async () =>
			Response.json({ message: 'Read unavailable' }, { status: 503, headers: { 'Retry-After': '0' } })
		);
		await expect(createFeedbackReview(createSupabaseFeedbackReviewStore(provider)).list()).rejects.toThrow();
	});

	it('lists every announcement exactly once when creation dates tie across the provider limit', async () => {
		const rows = Array.from({ length: 1002 }, (_, index) => ({
			id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
			title: `Notice ${index}`,
			message: 'Retained content',
			type: 'info',
			is_active: true,
			created_at: '2026-10-01T12:00:00Z',
			expires_at: null
		}));
		const provider = client(async (input) => {
			const url = new URL(String(input));
			if (url.pathname !== '/rest/v1/platform_announcements') throw new Error('Unexpected provider resource');
			const from = Number(url.searchParams.get('offset') ?? 0);
			const limit = Number(url.searchParams.get('limit') ?? 1000);
			const order = url.searchParams.get('order') ?? '';
			const ordered = order.includes('id.')
				? rows.toSorted((left, right) =>
						order.includes('id.desc') ? right.id.localeCompare(left.id) : left.id.localeCompare(right.id)
					)
				: from === 0
					? rows
					: rows.toReversed();
			return Response.json(ordered.slice(from, from + Math.min(limit, 1000)));
		});
		const result = await announcements(provider).list();
		expect(result).toHaveLength(1002);
		expect(new Set(result.map((row) => row.id)).size).toBe(1002);
		expect(new Set(result.map((row) => row.id))).toEqual(new Set(rows.map((row) => row.id)));
	});
});
