import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { listActiveAnnouncementContent } from './announcementContent.server';

it('returns every active/unexpired content page with only the public fields and propagates failed reads', async () => {
	const current = Array.from({ length: 1001 }, (_, index) => ({
		id: `announcement-${index}`,
		title: `Notice ${index}`,
		message: 'Content',
		type: 'info',
		is_active: true,
		expires_at: null as string | null,
		created_by: 'private-platform-actor'
	}));
	const rows = [
		...current,
		{ ...current[0], id: 'future', expires_at: '2099-01-01T00:00:00Z' },
		{ ...current[0], id: 'inactive', is_active: false },
		{ ...current[0], id: 'expired', expires_at: '2000-01-01T00:00:00Z' }
	];
	let failed = false;
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.pathname !== '/rest/v1/platform_announcements') throw new Error('Unexpected table');
				if (failed) return Response.json({ message: 'Provider unavailable' }, { status: 403 });
				const expiry = url.searchParams.get('or')?.match(/expires_at\.gt\.([^)]*)/)?.[1];
				const selected = rows.filter(
					(row) =>
						(!url.searchParams.has('is_active') ||
							String(row.is_active) === url.searchParams.get('is_active')?.slice(3)) &&
						(!expiry || !row.expires_at || row.expires_at > expiry)
				);
				const from = Number(url.searchParams.get('offset') ?? 0);
				const limit = Number(url.searchParams.get('limit') ?? 1000);
				const columns = url.searchParams
					.get('select')
					?.split(',')
					.map((column) => column.trim());
				return Response.json(
					selected
						.slice(from, from + limit)
						.map((row) =>
							columns ? Object.fromEntries(columns.map((key) => [key, row[key as keyof typeof row]])) : row
						)
				);
			}
		}
	});
	const result = await listActiveAnnouncementContent(client);
	expect(result).toEqual(
		[...current, rows[1001]].map(({ id, title, message, type }) => ({ id, title, message, type }))
	);
	failed = true;
	await expect(listActiveAnnouncementContent(client)).rejects.toThrow('Failed to load platform announcements');
});
