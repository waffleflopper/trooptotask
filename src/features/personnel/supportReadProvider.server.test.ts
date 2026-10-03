import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createPersonnelSupportReader } from './supportReadProvider.server';

function readerWithFetch(fetch: typeof globalThis.fetch) {
	return createPersonnelSupportReader(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch }
		})
	);
}

it('preserves active-only scope for batch and exact single-Organization counts', async () => {
	const rows = [
		{ organization_id: 'able', archived_at: null },
		{ organization_id: 'able', archived_at: null },
		{ organization_id: 'able', archived_at: '2026-01-01' },
		{ organization_id: 'baker', archived_at: null }
	];
	const reader = readerWithFetch(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		if (url.pathname === '/rest/v1/rpc/count_personnel_by_organization') {
			const { p_org_ids: ids } = await request.json();
			return Response.json(
				ids.map((id: string) => ({
					organization_id: id,
					personnel_count: String(rows.filter((row) => row.organization_id === id && row.archived_at === null).length)
				}))
			);
		}
		if (url.pathname !== '/rest/v1/personnel') return Response.json({ message: 'Unknown source' }, { status: 404 });
		const selected = rows.filter(
			(row) =>
				`eq.${row.organization_id}` === url.searchParams.get('organization_id') &&
				(url.searchParams.get('archived_at') !== 'is.null' || row.archived_at === null)
		);
		return new Response(null, { headers: { 'content-range': `*/${selected.length}` } });
	});
	await expect(reader.countActivePersonnelByOrganization(['able', 'empty'])).resolves.toEqual(
		new Map([
			['able', 2],
			['empty', 0]
		])
	);
	await expect(reader.countActivePersonnelForOrganization('able')).resolves.toBe(2);
	await expect(reader.countActivePersonnelForOrganization('empty')).resolves.toBe(0);
});

describe('Personnel support count failure', () => {
	it.each(['countActivePersonnelByOrganization', 'countActivePersonnelForOrganization'] as const)(
		'propagates a failed %s count',
		async (method) => {
			const reader = readerWithFetch(async () => Response.json({ message: 'Denied', code: '42501' }, { status: 403 }));
			const read = method === 'countActivePersonnelByOrganization' ? reader[method](['able']) : reader[method]('able');
			await expect(read).rejects.toMatchObject({ code: '42501' });
		}
	);

	it('does not interpret a missing exact count as an empty roster', async () => {
		const reader = readerWithFetch(async () => new Response(null));
		await expect(reader.countActivePersonnelForOrganization('able')).rejects.toThrow(
			'Active personnel count was unavailable'
		);
	});

	it.each([null, 'unknown', -1, 1.5])('rejects invalid aggregate count %s', async (personnel_count) => {
		const reader = readerWithFetch(async () => Response.json([{ organization_id: 'able', personnel_count }]));
		await expect(reader.countActivePersonnelByOrganization(['able'])).rejects.toThrow(
			'Active personnel count was unavailable'
		);
	});
});
