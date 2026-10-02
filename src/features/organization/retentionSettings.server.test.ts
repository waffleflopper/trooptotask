import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOrganizationRetentionSettingsReader } from './retentionSettings.server';

function provider(count: number) {
	const rows = Array.from({ length: count }, (_, index) => ({
		id: String(index + 1).padStart(5, '0'),
		archive_retention_months: index === 0 ? null : index === 1 ? 0 : index === 2 ? 36.5 : 12,
		suspended_at: index === count - 1 ? '2020-01-01T00:00:00Z' : null
	}));
	const state = { requests: [] as string[], failFrom: null as number | null, nullData: false };
	const client = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				state.requests.push(url.href);
				if (url.pathname !== '/rest/v1/organizations' || (init?.method ?? 'GET') !== 'GET')
					throw new Error('Settings enumeration must not perform resource effects');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ message: 'Organization settings unavailable', code: '42501' }, { status: 403 });
				if (state.nullData) return Response.json(null);
				let ordered = [...rows].reverse();
				if (url.searchParams.get('order') === 'id.asc') ordered.sort((left, right) => left.id.localeCompare(right.id));
				if (url.searchParams.has('suspended_at')) ordered = ordered.filter((row) => row.suspended_at === null);
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				const fields = (url.searchParams.get('select') ?? '*').split(',');
				return Response.json(
					ordered
						.slice(offset, offset + limit)
						.map((row) =>
							fields[0] === '*'
								? row
								: Object.fromEntries(fields.map((field) => [field, row[field as keyof typeof row]]))
						)
				);
			}
		}
	});
	return { reader: createSupabaseOrganizationRetentionSettingsReader(client), rows, state };
}

describe('Organization maintenance settings reader', () => {
	it.each([0, 1000, 1001])('completely enumerates %s Organizations in stable order', async (count) => {
		const fixture = provider(count);
		expect(fixture.state.requests).toEqual([]);
		const result = await fixture.reader.listConfigurations();
		expect(result).toEqual(fixture.rows.map((row) => ({ id: row.id, retentionMonths: row.archive_retention_months })));
		for (const request of fixture.state.requests) {
			const url = new URL(request);
			expect(url.searchParams.get('select')).toBe('id,archive_retention_months');
		}
	});

	it('preserves null, zero and fractional values for the cleanup owners to interpret', async () => {
		await expect(provider(3).reader.listConfigurations()).resolves.toEqual([
			{ id: '00001', retentionMonths: null },
			{ id: '00002', retentionMonths: 0 },
			{ id: '00003', retentionMonths: 36.5 }
		]);
	});

	it.each([0, 1000])('rejects provider failure from offset %s without returning an earlier page', async (offset) => {
		const fixture = provider(1001);
		fixture.state.failFrom = offset;
		await expect(fixture.reader.listConfigurations()).rejects.toThrow('Organization settings unavailable');
	});

	it('keeps an error-free null result empty', async () => {
		const fixture = provider(0);
		fixture.state.nullData = true;
		await expect(fixture.reader.listConfigurations()).resolves.toEqual([]);
	});
});
