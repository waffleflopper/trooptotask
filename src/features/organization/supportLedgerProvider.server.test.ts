import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOrganizationSupportReader } from './supportReadProvider.server';

function storeWithFetch(fetch: typeof globalThis.fetch) {
	return createOrganizationSupportReader(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch }
		})
	);
}

function organizationStore(
	rows = [
		{ id: 'old-active', name: 'Able Clinic', suspended_at: null, created_at: '2026-06-01' },
		{ id: 'suspended', name: 'Able Support', suspended_at: '2026-09-01', created_at: '2026-08-01' },
		{ id: 'new-active', name: 'Able Company', suspended_at: null, created_at: '2026-09-01' },
		{ id: 'other', name: 'Baker Company', suspended_at: null, created_at: '2026-09-02' }
	]
) {
	return storeWithFetch(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		const query = url.searchParams;
		expect(['GET', 'HEAD']).toContain(request.method);
		expect(url.pathname).toBe('/rest/v1/organizations');
		// This provider fixture exposes only retained columns. A commercial read fails,
		// including joins or filters, even if its result would later be discarded.
		const columns = (query.get('select') ?? '').split(',');
		if (
			columns.some((column) => !['id', 'name', 'suspended_at', 'created_at'].includes(column)) ||
			[...query.keys()].some((key) => !['select', 'order', 'name', 'suspended_at', 'offset', 'limit'].includes(key))
		) {
			return Response.json({ message: 'Unknown ledger column' }, { status: 400 });
		}
		let selected = rows.filter((row) => {
			const name = query.get('name');
			const suspension = query.get('suspended_at');
			return (
				(!name || row.name.toLowerCase().includes(name.slice(7, -1).toLowerCase())) &&
				(!suspension || (suspension === 'is.null' ? row.suspended_at === null : row.suspended_at !== null))
			);
		});
		const orders = (query.get('order') ?? '').split(',').filter(Boolean);
		selected = selected.sort((a, b) => {
			for (const order of orders) {
				const [column, direction] = order.split('.');
				const comparison = String(a[column as keyof typeof a]).localeCompare(String(b[column as keyof typeof b]));
				if (comparison) return direction === 'desc' ? -comparison : comparison;
			}
			return 0;
		});
		const totalCount = selected.length;
		const offset = Number(query.get('offset') ?? 0);
		const limit = Number(query.get('limit') ?? selected.length);
		if (request.method === 'HEAD') return new Response(null, { headers: { 'content-range': `*/${totalCount}` } });
		if (offset > 0 && offset >= totalCount) {
			return Response.json(
				{
					code: 'PGRST103',
					details: `An offset of ${offset} was requested, but there are only ${totalCount} rows.`,
					hint: null,
					message: 'Requested range not satisfiable'
				},
				{ status: 416, headers: { 'content-range': `*/${totalCount}` } }
			);
		}
		selected = selected.slice(offset, offset + limit);
		return Response.json(
			selected.map((row) => Object.fromEntries(columns.map((column) => [column, row[column as keyof typeof row]]))),
			{
				headers: request.headers.get('prefer')?.includes('count=exact')
					? { 'content-range': `${selected.length ? `${offset}-${offset + selected.length - 1}` : '*'}/${totalCount}` }
					: {}
			}
		);
	});
}

describe('Platform Organization Ledger provider boundary', () => {
	it('keeps equally dated Organizations on distinct ordered pages', async () => {
		const store = organizationStore([
			{ id: 'a', name: 'First inserted', suspended_at: null, created_at: '2026-10-01' },
			{ id: 'z', name: 'Highest ID', suspended_at: null, created_at: '2026-10-01' },
			{ id: 'm', name: 'Middle ID', suspended_at: null, created_at: '2026-10-01' }
		]);
		const first = await store.listOrganizationsPage({ q: '', status: 'all', from: 0, to: 1 });
		const second = await store.listOrganizationsPage({ q: '', status: 'all', from: 2, to: 3 });
		expect(first.organizations.map((row) => row.id)).toEqual(['z', 'm']);
		expect(second.organizations.map((row) => row.id)).toEqual(['a']);
		expect(first.totalCount).toBe(3);
		expect(second.totalCount).toBe(3);
	});
	it('searches names case-insensitively, orders newest first, and counts matches before pagination without commercial columns', async () => {
		const store = organizationStore();
		const page = await store.listOrganizationsPage({ q: 'aBlE', status: 'all', from: 1, to: 1 });
		expect(page).toEqual({
			organizations: [{ id: 'suspended', name: 'Able Support', suspended_at: '2026-09-01', created_at: '2026-08-01' }],
			totalCount: 3
		});
	});

	it.each([
		['active', ['new-active', 'old-active']],
		['suspended', ['suspended']]
	])('filters %s organizations using suspension state', async (status, expectedIds) => {
		const page = await organizationStore().listOrganizationsPage({ q: 'Able', status, from: 0, to: 24 });
		expect(page.organizations.map((row) => row.id)).toEqual(expectedIds);
		expect(page.totalCount).toBe(expectedIds.length);
	});

	it('reports the matching total and no rows for a page past the last row instead of failing', async () => {
		const store = organizationStore();
		expect(await store.listOrganizationsPage({ q: '', status: 'all', from: 25, to: 49 })).toEqual({
			organizations: [],
			totalCount: 4
		});
		expect(await store.listOrganizationsPage({ q: 'able', status: 'suspended', from: 25, to: 49 })).toEqual({
			organizations: [],
			totalCount: 1
		});
		expect(await store.listOrganizationsPage({ q: 'zzz', status: 'all', from: 25, to: 49 })).toEqual({
			organizations: [],
			totalCount: 0
		});
	});

	it('propagates provider failures instead of showing an empty organization directory', async () => {
		const store = storeWithFetch(async () =>
			Response.json({ message: 'Directory denied', code: '42501' }, { status: 403 })
		);
		await expect(store.listOrganizationsPage({ q: '', status: 'all', from: 0, to: 24 })).rejects.toMatchObject({
			code: '42501'
		});
	});
});
