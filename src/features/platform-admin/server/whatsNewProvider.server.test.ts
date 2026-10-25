import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseWhatsNewStore } from './whatsNewProvider.server';
import { listPublishedWhatsNew } from './whatsNewContent.server';

function client(fetchProvider: typeof fetch) {
	return createClient('http://provider.example.test', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetchProvider }
	});
}

const row = {
	id: 'entry-1',
	title: 'Roster',
	paragraphs: ['One'],
	published_on: null as string | null,
	updated_by: 'operator-1',
	updated_at: '2026-10-24T00:00:00Z'
};

describe('What’s New persistence through the real SDK', () => {
	it('lists drafts first, then the newest published entry, and maps the columns', async () => {
		let query: URLSearchParams | undefined;
		const store = createSupabaseWhatsNewStore(
			client(async (input) => {
				query = new URL(String(input)).searchParams;
				return Response.json([row, { ...row, id: 'entry-2', published_on: '2026-10-01' }]);
			})
		);
		const entries = await store.listEntries();
		expect(entries.map((entry) => [entry.id, entry.publishedOn])).toEqual([
			['entry-1', null],
			['entry-2', '2026-10-01']
		]);
		expect(entries[0]).toMatchObject({ updatedBy: 'operator-1', updatedAt: '2026-10-24T00:00:00Z' });
		expect(query?.get('order')).toBe('published_seq.desc.nullsfirst,updated_at.desc,id.asc');
	});

	it('rejects a failed list rather than returning a partial list', async () => {
		const store = createSupabaseWhatsNewStore(client(async () => Response.json({ message: 'down' }, { status: 500 })));
		await expect(store.listEntries()).rejects.toThrow('table whats_new_entries list failed');
	});

	it('inserts the attributed draft and returns it', async () => {
		let body: unknown;
		const store = createSupabaseWhatsNewStore(
			client(async (_input, init) => {
				body = JSON.parse(String(init?.body));
				return Response.json(row, { status: 201 });
			})
		);
		await expect(
			store.createEntry({ title: 'Roster', paragraphs: ['One'], publishedOn: null, updatedBy: 'operator-1' })
		).resolves.toMatchObject({ id: 'entry-1' });
		expect(body).toEqual({ title: 'Roster', paragraphs: ['One'], published_on: null, updated_by: 'operator-1' });
	});

	it('leaves published_on out of an update unless a publish date is given', async () => {
		const bodies: Record<string, unknown>[] = [];
		const store = createSupabaseWhatsNewStore(
			client(async (_input, init) => {
				bodies.push(JSON.parse(String(init?.body)));
				return Response.json({ id: 'entry-1' });
			})
		);
		await store.updateEntry({ id: 'entry-1', title: 'T', paragraphs: ['P'], updatedBy: 'operator-1' });
		await store.updateEntry({
			id: 'entry-1',
			title: 'T',
			paragraphs: ['P'],
			publishedOn: '2026-10-24',
			updatedBy: 'operator-1'
		});
		expect(bodies[0]).not.toHaveProperty('published_on');
		expect(bodies[1]).toHaveProperty('published_on', '2026-10-24');
	});

	it('rejects an update the provider refuses', async () => {
		const store = createSupabaseWhatsNewStore(client(async () => new Response(null, { status: 406 })));
		await expect(
			store.updateEntry({ id: 'gone', title: 'T', paragraphs: ['P'], updatedBy: 'operator-1' })
		).rejects.toThrow();
	});

	it('deletes only an entry that is still a draft', async () => {
		let query: URLSearchParams | undefined;
		const store = createSupabaseWhatsNewStore(
			client(async (input) => {
				query = new URL(String(input)).searchParams;
				return new Response(null, { status: 204 });
			})
		);
		await store.deleteDraft('entry-1');
		expect(query?.get('id')).toBe('eq.entry-1');
		expect(query?.get('published_on')).toBe('is.null');
	});
});

describe('Published What’s New read', () => {
	it('asks for the newest published entries by publish order, limited, and maps them', async () => {
		let query: URLSearchParams | undefined;
		const entries = await listPublishedWhatsNew(
			client(async (input) => {
				query = new URL(String(input)).searchParams;
				return Response.json([{ id: 'a', title: 'A', paragraphs: ['x'], published_on: '2026-10-24' }]);
			}),
			3
		);
		expect(entries).toEqual([{ id: 'a', title: 'A', paragraphs: ['x'], publishedOn: '2026-10-24' }]);
		expect(query?.get('published_seq')).toBe('not.is.null');
		expect(query?.get('order')).toBe('published_seq.desc');
		expect(query?.get('limit')).toBe('3');
	});

	it('rejects a failed read so the caller can show its load error', async () => {
		await expect(
			listPublishedWhatsNew(
				client(async () => Response.json({ message: 'down' }, { status: 500 })),
				3
			)
		).rejects.toThrow();
	});
});
