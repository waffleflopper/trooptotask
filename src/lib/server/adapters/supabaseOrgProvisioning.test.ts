import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseOrgProvisioningPort } from './supabaseOrgProvisioning';
import { provisionOrganization } from '$lib/server/core/useCases/orgProvisioning';
import { seedDefaultGroups, seedDefaultRankCatalog } from '$features/personnel/index.server';

// Exercise the real SDK wire format without connecting to a provider. SQL/RLS and
// transaction guarantees belong to the isolated database contract in 02-03-04.
function httpPort(handle: (request: Request) => Promise<Response>) {
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: (input, init) => handle(new Request(input, init)) }
	});
	return createSupabaseOrgProvisioningPort(
		{ supabase } as never,
		(orgId) => seedDefaultGroups(supabase, orgId),
		(orgId) => seedDefaultRankCatalog(supabase, orgId)
	);
}

function providerFailure(message: string) {
	return Response.json({ code: '42501', message, details: '', hint: '' }, { status: 403 });
}

describe('provisioning provider boundary', () => {
	it('creates repeated Organizations with owner/defaults without reading ownership or billing data', async () => {
		const creations: Array<{ id: string; name: string }> = [];
		const writes: Array<{ table: string; body: unknown }> = [];
		const port = httpPort(async (request) => {
			const path = new URL(request.url).pathname;
			// Any ownership, plan, subscription or usage read fails at the real SDK boundary.
			if (request.method === 'GET') throw new Error(`Unexpected provisioning read: ${path}`);
			const body = await request.json();
			if (path === '/rest/v1/rpc/create_org_with_owner') {
				const id = `org-${creations.length + 1}`;
				creations.push({ id, name: body.p_name });
				return Response.json(id);
			}
			writes.push({ table: path.split('/').at(-1)!, body });
			return new Response(null, { status: 201 });
		});
		for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
			await provisionOrganization(port, { name, userId: 'owner', email: 'OWNER@EXAMPLE.TEST' });
		}
		expect(creations).toEqual([
			{ id: 'org-1', name: 'Alpha' },
			{ id: 'org-2', name: 'Bravo' },
			{ id: 'org-3', name: 'Charlie' },
			{ id: 'org-4', name: 'Delta' }
		]);
		for (const { id } of creations) {
			expect(writes).toEqual(
				expect.arrayContaining([
					{
						table: 'groups',
						body: [
							{ organization_id: id, name: 'Leadership', sort_order: 0 },
							{ organization_id: id, name: 'Alpha', sort_order: 1 },
							{ organization_id: id, name: 'Bravo', sort_order: 2 }
						]
					},
					{
						table: 'assignment_types',
						body: expect.arrayContaining([
							expect.objectContaining({ organization_id: id, name: 'Staff Duty', assign_to: 'personnel' })
						])
					},
					{
						table: 'organization_rank_catalog',
						body: expect.arrayContaining([
							expect.objectContaining({ organization_id: id, code: 'SGT', state: 'active' })
						])
					}
				])
			);
		}
	});

	it.each([
		['created', 200, 'org-created', { orgId: 'org-created', errorMessage: null }],
		[
			'owner denied',
			403,
			{ code: '42501', message: 'Owner insert denied' },
			{ orgId: null, errorMessage: 'Owner insert denied' }
		],
		['missing result', 200, null, { orgId: null, errorMessage: null }]
	] as const)('maps %s through the authenticated owner-creation RPC', async (_, status, body, expected) => {
		const requests: Array<{ path: string; method: string; body: unknown }> = [];
		const port = httpPort(async (request) => {
			requests.push({ path: new URL(request.url).pathname, method: request.method, body: await request.json() });
			return Response.json(body, { status });
		});
		expect(await port.createOrganizationWithOwner('Alpha Company')).toEqual(expected);
		// The RPC derives ownership from the authenticated session, never a supplied actor.
		expect(requests).toEqual([
			{ path: '/rest/v1/rpc/create_org_with_owner', method: 'POST', body: { p_name: 'Alpha Company' } }
		]);
	});

	it('updates only the requested owner membership, preserving another actor and another Organization', async () => {
		const memberships = [
			{ organization_id: 'org-1', user_id: 'user-1', email: 'old@example.test' },
			{ organization_id: 'org-1', user_id: 'user-2', email: 'member@example.test' },
			{ organization_id: 'org-2', user_id: 'user-1', email: 'sibling@example.test' }
		];
		const port = httpPort(async (request) => {
			const url = new URL(request.url);
			expect(url.pathname).toBe('/rest/v1/organization_memberships');
			expect(request.method).toBe('PATCH');
			const patch = await request.json();
			for (const row of memberships) {
				const matches = [...url.searchParams].every(([key, value]) => row[key as keyof typeof row] === value.slice(3));
				if (matches) Object.assign(row, patch);
			}
			return new Response(null, { status: 204 });
		});
		expect(
			await port.updateOwnerMembershipEmail({ organizationId: 'org-1', userId: 'user-1', email: 'owner@example.test' })
		).toBeNull();
		expect(memberships).toEqual([
			{ organization_id: 'org-1', user_id: 'user-1', email: 'owner@example.test' },
			{ organization_id: 'org-1', user_id: 'user-2', email: 'member@example.test' },
			{ organization_id: 'org-2', user_id: 'user-1', email: 'sibling@example.test' }
		]);
	});

	const writes = [
		{
			name: 'owner email',
			table: 'organization_memberships',
			write: (port: ReturnType<typeof httpPort>) =>
				port.updateOwnerMembershipEmail({ organizationId: 'org-1', userId: 'user-1', email: 'owner@example.test' }),
			body: { email: 'owner@example.test' }
		},
		{
			name: 'Groups',
			table: 'groups',
			write: (port: ReturnType<typeof httpPort>) => port.seedDefaultGroups('org-1'),
			body: [
				{ organization_id: 'org-1', name: 'Leadership', sort_order: 0 },
				{ organization_id: 'org-1', name: 'Alpha', sort_order: 1 },
				{ organization_id: 'org-1', name: 'Bravo', sort_order: 2 }
			]
		},
		{
			name: 'statuses',
			table: 'status_types',
			write: (port: ReturnType<typeof httpPort>) =>
				port.seedDefaultStatusTypes('org-1', [
					{
						name: 'Leave',
						color: '#48bb78',
						textColor: '#ffffff',
						sortOrder: 0
					}
				]),
			body: [
				{
					organization_id: 'org-1',
					name: 'Leave',
					color: '#48bb78',
					text_color: '#ffffff',
					sort_order: 0
				}
			]
		},
		{
			name: 'manual assignments',
			table: 'assignment_types',
			write: (port: ReturnType<typeof httpPort>) =>
				port.seedDefaultAssignmentTypes('org-1', [
					{ name: 'Staff Duty', shortName: 'SD', assignTo: 'personnel', color: '#dc2626', sortOrder: 0 }
				]),
			body: [
				{
					organization_id: 'org-1',
					name: 'Staff Duty',
					short_name: 'SD',
					assign_to: 'personnel',
					color: '#dc2626',
					sort_order: 0
				}
			]
		},
		{
			name: 'holidays',
			table: 'special_days',
			write: (port: ReturnType<typeof httpPort>) =>
				port.seedFederalHolidays('org-1', [{ date: '2026-07-03', name: 'Independence Day', type: 'federal-holiday' }]),
			body: [{ organization_id: 'org-1', date: '2026-07-03', name: 'Independence Day', type: 'federal-holiday' }]
		}
	];

	it.each(writes)(
		'serializes $name at the provider boundary and surfaces write denial',
		async ({ write, table, body }) => {
			for (const denied of [false, true]) {
				const received: unknown[] = [];
				const port = httpPort(async (request) => {
					expect(new URL(request.url).pathname).toBe(`/rest/v1/${table}`);
					expect(request.method).toBe(table === 'organization_memberships' ? 'PATCH' : 'POST');
					received.push(await request.json());
					return denied ? providerFailure('Write denied') : new Response(null, { status: 201 });
				});
				expect(await write(port)).toBe(denied ? 'Write denied' : null);
				expect(received).toEqual([body]);
			}
		}
	);

	it('preserves an earlier holiday write error when a later batch succeeds', async () => {
		const days = Array.from({ length: 51 }, (_, index) => ({
			date: '2026-01-01',
			name: `Synthetic holiday ${index}`,
			type: 'federal-holiday'
		}));
		const received: unknown[] = [];
		const port = httpPort(async (request) => {
			received.push(...(await request.json()));
			return received.length <= 50 ? providerFailure('First batch denied') : new Response(null, { status: 201 });
		});
		expect(await port.seedFederalHolidays('org-1', days)).toBe('First batch denied');
		expect(received).toEqual(days.map((day) => ({ organization_id: 'org-1', ...day })));
	});

	it('seeds the retained rank defaults with duplicate-ignore and surfaces provider denial', async () => {
		for (const denied of [false, true]) {
			const port = httpPort(async (request) => {
				expect(new URL(request.url).pathname).toBe('/rest/v1/organization_rank_catalog');
				expect(new URL(request.url).searchParams.get('on_conflict')).toBe('organization_id,code');
				expect(request.headers.get('prefer')).toContain('resolution=ignore-duplicates');
				const rows = (await request.json()) as Array<Record<string, unknown>>;
				expect(rows).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ organization_id: 'org-1', code: 'SGT', pay_grade: 'E-5', source: 'built-in' }),
						expect.objectContaining({ organization_id: 'org-1', code: 'CIV', source: 'built-in' })
					])
				);
				expect(new Set(rows.map((row) => row.service))).toEqual(new Set(['army', 'civilian', 'custom']));
				return denied ? providerFailure('Rank seed denied') : new Response(null, { status: 201 });
			});
			expect(await port.seedDefaultRankCatalog('org-1')).toBe(denied ? 'Rank seed denied' : null);
		}
	});
});
