import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createSupabaseAccountAnnouncementDismissals,
	dismissAccountAnnouncement
} from './announcementDismissals.server';

const ID = '11111111-1111-4111-8111-111111111111';
function provider() {
	const state = {
		rows: Array.from({ length: 1001 }, (_, index) => ({
			user_id: 'account-a',
			announcement_id: `announcement-${index}`
		})).concat([{ user_id: 'account-b', announcement_id: 'peer' }]),
		failed: false
	};
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.pathname !== '/rest/v1/announcement_dismissals') throw new Error('Unexpected provider table');
				if (state.failed) return Response.json({ message: 'Provider unavailable' }, { status: 403 });
				if (request.method === 'POST') {
					const row = await request.json();
					if (
						!state.rows.some((saved) => saved.user_id === row.user_id && saved.announcement_id === row.announcement_id)
					)
						state.rows.push(row);
					return new Response(null, { status: 201 });
				}
				const own = state.rows.filter((row) => url.searchParams.get('user_id') === `eq.${row.user_id}`);
				const from = Number(url.searchParams.get('offset') ?? 0);
				const count = Number(url.searchParams.get('limit') ?? 1000);
				return Response.json(own.slice(from, from + count).map(({ announcement_id }) => ({ announcement_id })));
			}
		}
	});
	return { client, state };
}

describe('account-wide announcement dismissals', () => {
	it('loads complete own-account pages, binds writes to that account and tolerates explicit duplicate retry', async () => {
		const { client, state } = provider();
		const dismissals = createSupabaseAccountAnnouncementDismissals(client, 'account-a');
		const ids = await dismissals.listDismissedIds();
		expect(ids).toHaveLength(1001);
		expect(ids).toContain('announcement-1000');
		expect(ids).not.toContain('peer');
		await dismissAccountAnnouncement({ userId: 'account-a', dismissals }, ID);
		await dismissAccountAnnouncement({ userId: 'account-a', dismissals }, ID);
		expect(state.rows.filter((row) => row.announcement_id === ID)).toEqual([
			{ announcement_id: ID, user_id: 'account-a' }
		]);
	});
	it('rejects missing admission and invalid identity before writing, and preserves failure for explicit retry', async () => {
		const { client, state } = provider();
		const dismissals = createSupabaseAccountAnnouncementDismissals(client, 'account-a');
		await expect(dismissAccountAnnouncement({ userId: '', dismissals }, ID)).rejects.toMatchObject({ status: 401 });
		await expect(dismissAccountAnnouncement({ userId: 'account-a', dismissals }, 'invalid')).rejects.toMatchObject({
			status: 400
		});
		state.failed = true;
		await expect(dismissAccountAnnouncement({ userId: 'account-a', dismissals }, ID)).rejects.toThrow(
			'Failed to dismiss announcement'
		);
		await expect(dismissals.listDismissedIds()).rejects.toThrow('Failed to load announcement dismissals');
		expect(state.rows.some((row) => row.announcement_id === ID)).toBe(false);
		state.failed = false;
		await dismissAccountAnnouncement({ userId: 'account-a', dismissals }, ID);
		expect(await dismissals.listDismissedIds()).toContain(ID);
	});
});
