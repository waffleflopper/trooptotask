import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createIdentityPlatformDashboardReader } from './platformDashboardReader.server';

function reader(fetchProvider: typeof fetch) {
	const client = createClient('http://provider.example.test', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetchProvider }
	});
	return createIdentityPlatformDashboardReader(client);
}

function jsonReader(data: unknown) {
	return reader(async () => Response.json(data));
}

describe('Identity Platform Dashboard facts through the real SDK', () => {
	it('projects required account statistics without forwarding unused provider values', async () => {
		await expect(jsonReader({ total: 12, last_30_days: 3, previous_30_days: 9 }).countPlatformUsers()).resolves.toEqual(
			{ total: 12, last30Days: 3 }
		);
	});
	it('retains genuine zero account statistics', async () => {
		await expect(jsonReader({ total: 0, last_30_days: 0 }).countPlatformUsers()).resolves.toEqual({
			total: 0,
			last30Days: 0
		});
	});
	it.each([
		null,
		[],
		{},
		{ total: 1 },
		{ total: -1, last_30_days: 0 },
		{ total: 1.5, last_30_days: 0 },
		{ total: '1', last_30_days: 0 },
		{ total: 1, last_30_days: null }
	])('rejects unavailable or malformed mandatory account statistics: %j', async (data) => {
		await expect(jsonReader(data).countPlatformUsers()).rejects.toThrow();
	});
	it('preserves the SQL json_agg empty result as an empty signup trend', async () => {
		await expect(jsonReader(null).listDailySignupsLast30Days()).resolves.toEqual([]);
		await expect(jsonReader([]).listDailySignupsLast30Days()).resolves.toEqual([]);
	});
	it('projects dated signup counts', async () => {
		await expect(
			jsonReader([{ date: '2026-06-01', count: 3, unused: 'private' }]).listDailySignupsLast30Days()
		).resolves.toEqual([{ date: '2026-06-01', count: 3 }]);
	});
	it.each([
		{},
		[null],
		[{ date: '2026-02-30', count: 1 }],
		[{ date: 'invalid', count: 1 }],
		[{ date: '2026-06-01', count: -1 }],
		[{ date: '2026-06-01', count: '1' }]
	])('rejects malformed signup facts: %j', async (data) => {
		await expect(jsonReader(data).listDailySignupsLast30Days()).rejects.toThrow();
	});
	it('counts only pending Access Requests while retaining an exact zero', async () => {
		const counts = reader(async (input, init) => {
			const url = new URL(String(input));
			if (url.pathname !== '/rest/v1/access_requests' || init?.method !== 'HEAD')
				throw new Error('Unexpected provider request');
			return new Response(null, {
				headers: { 'content-range': url.searchParams.get('status') === 'eq.pending' ? '*/0' : '*/7' }
			});
		});
		await expect(counts.countPendingAccessRequests()).resolves.toBe(0);
	});
	it('rejects an absent exact count instead of displaying an empty Access Request queue', async () => {
		await expect(reader(async () => new Response(null)).countPendingAccessRequests()).rejects.toThrow();
	});
	it.each(['countPlatformUsers', 'listDailySignupsLast30Days', 'countPendingAccessRequests'] as const)(
		'propagates provider failure from %s',
		async (operation) => {
			const source = reader(async () => Response.json({ message: 'Read unavailable' }, { status: 400 }));
			await expect(source[operation]()).rejects.toThrow();
		}
	);
});
