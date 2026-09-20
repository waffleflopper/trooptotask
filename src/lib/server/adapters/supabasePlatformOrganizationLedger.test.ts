import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { normalizePlatformOrganizationLedgerQuery } from '$lib/server/core/useCases/platformOrganizationLedger';
import { createSupabasePlatformOrganizationLedgerStore } from './supabasePlatformOrganizationLedger';

function storeWithFetch(fetch: typeof globalThis.fetch) {
	return createSupabasePlatformOrganizationLedgerStore(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch }
		})
	);
}

function organizationStore() {
	const rows = [
		{ id: 'old-active', name: 'Able Clinic', suspended_at: null, created_at: '2026-06-01' },
		{ id: 'suspended', name: 'Able Support', suspended_at: '2026-09-01', created_at: '2026-08-01' },
		{ id: 'new-active', name: 'Able Company', suspended_at: null, created_at: '2026-09-01' },
		{ id: 'other', name: 'Baker Company', suspended_at: null, created_at: '2026-09-02' }
	];
	return storeWithFetch(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		const query = url.searchParams;
		expect(request.method).toBe('GET');
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
		if (query.get('order') === 'created_at.desc') {
			selected = selected.sort((a, b) => b.created_at.localeCompare(a.created_at));
		}
		const totalCount = selected.length;
		const offset = Number(query.get('offset') ?? 0);
		const limit = Number(query.get('limit') ?? selected.length);
		selected = selected.slice(offset, offset + limit);
		return Response.json(
			selected.map((row) => Object.fromEntries(columns.map((column) => [column, row[column as keyof typeof row]]))),
			{
				headers: request.headers.get('prefer')?.includes('count=exact')
					? { 'content-range': `${offset}-${offset + selected.length - 1}/${totalCount}` }
					: {}
			}
		);
	});
}

describe('Platform Organization Ledger provider boundary', () => {
	it('searches names case-insensitively, orders newest first, and counts matches before pagination without commercial columns', async () => {
		const store = organizationStore();
		const page = await store.listOrganizationsPage(
			normalizePlatformOrganizationLedgerQuery({ q: 'aBlE', page: 2, pageSize: 1 })
		);
		expect(page).toEqual({
			organizations: [{ id: 'suspended', name: 'Able Support', suspended_at: '2026-09-01', created_at: '2026-08-01' }],
			totalCount: 3
		});
	});

	it.each([
		['active', ['new-active', 'old-active']],
		['suspended', ['suspended']]
	])('filters %s organizations using suspension state', async (status, expectedIds) => {
		const page = await organizationStore().listOrganizationsPage(
			normalizePlatformOrganizationLedgerQuery({ q: 'Able', status })
		);
		expect(page.organizations.map((row) => row.id)).toEqual(expectedIds);
		expect(page.totalCount).toBe(expectedIds.length);
	});

	it('propagates provider failures instead of showing an empty organization directory', async () => {
		const store = storeWithFetch(async () =>
			Response.json({ message: 'Directory denied', code: '42501' }, { status: 403 })
		);
		await expect(store.listOrganizationsPage(normalizePlatformOrganizationLedgerQuery())).rejects.toMatchObject({
			code: '42501'
		});
	});
});
