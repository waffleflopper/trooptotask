import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createOrganizationProvisioningDelivery } from './organizationProvisioningDelivery';
import { provisionOrganization, type OrganizationDefaults } from '$features/organization/index.server';

// Exercise the real SDK wire format without connecting to a provider. SQL/RLS and
// transaction guarantees belong to the isolated database contract in org_ownership_rpc_contract.sql.
function httpPort(handle: (request: Request) => Promise<Response>) {
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: (input, init) => handle(new Request(input, init)) }
	});
	return createOrganizationProvisioningDelivery({ supabase } as never);
}

describe('Organization provisioning delivery boundary', () => {
	afterEach(() => vi.useRealTimers());

	it('creates an Organization in one provider call carrying every retained default', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
		const calls: Array<{
			method: string;
			path: string;
			body: { p_name: string; p_request_id: string; p_defaults: OrganizationDefaults };
		}> = [];
		const port = httpPort(async (request) => {
			calls.push({ method: request.method, path: new URL(request.url).pathname, body: await request.json() });
			return Response.json('org-1');
		});

		const requestId = '6f0c6c9e-7a53-4d1b-9a4e-2f3f0f9f0a11';
		expect(await provisionOrganization(port, { name: 'Alpha Company', requestId })).toEqual({ orgId: 'org-1' });

		expect(calls).toHaveLength(1);
		const [{ method, path, body }] = calls;
		expect([method, path]).toEqual(['POST', '/rest/v1/rpc/create_organization']);
		expect(body.p_name).toBe('Alpha Company');
		expect(body.p_request_id).toBe(requestId);
		const defaults = body.p_defaults;
		expect(Object.keys(defaults).sort()).toEqual([
			'assignment_types',
			'groups',
			'rank_catalog',
			'special_days',
			'status_types'
		]);
		expect(defaults.groups).toEqual([]);
		expect(defaults.status_types).toEqual([]);
		expect(defaults.assignment_types).toEqual([]);
		expect(defaults.special_days).toHaveLength(44);
		expect(defaults.special_days).toEqual(
			expect.arrayContaining([
				{ date: '2025-01-01', name: "New Year's Day", type: 'federal-holiday' },
				{ date: '2026-07-03', name: 'Independence Day', type: 'federal-holiday' },
				{ date: '2028-12-25', name: 'Christmas Day', type: 'federal-holiday' }
			])
		);
		expect(defaults.rank_catalog).toEqual(
			expect.arrayContaining([
				{
					code: 'SGT',
					label: expect.any(String),
					service: 'army',
					category: 'enlisted',
					pay_grade: 'E-5',
					state: 'active',
					source: 'built-in',
					sort_order: expect.any(Number)
				}
			])
		);
		expect(new Set(defaults.rank_catalog.map((row) => row.service))).toEqual(new Set(['army', 'civilian', 'custom']));
		// One duplicate code would fail organization_rank_catalog_org_code_key and so every creation.
		const codes = defaults.rank_catalog.map((row) => row.code);
		expect(codes).toHaveLength(30);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('reports a provider failure without a second write, so a retry has a single operation to repeat', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const paths: string[] = [];
		const port = httpPort(async (request) => {
			paths.push(new URL(request.url).pathname);
			return Response.json({ code: 'P0001', message: 'synthetic provider failure' }, { status: 500 });
		});

		await expect(
			provisionOrganization(port, { name: 'Alpha Company', requestId: '6f0c6c9e-7a53-4d1b-9a4e-2f3f0f9f0a11' })
		).rejects.toMatchObject({ status: 503 });
		expect(paths).toEqual(['/rest/v1/rpc/create_organization']);
	});
});
