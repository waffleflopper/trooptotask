import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOrganizationAuditStore } from './supabaseOrganizationAudit.server';

function reader(fetch: typeof globalThis.fetch) {
	return createSupabaseOrganizationAuditStore(
		createClient('http://127.0.0.1:1', 'synthetic-anon-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch }
		})
	);
}

describe('Organization Audit provider reads', () => {
	const PERSON = '11111111-1111-4111-8111-111111111111';
	const MEMBER = '22222222-2222-4222-8222-222222222222';
	const CURSOR_ID = '33333333-3333-4333-8333-333333333333';
	const EXCLUDED =
		'not.in.(auth.login_success,auth.login_failure,auth.mfa_verify,security.rate_limit_violation,security.rate_limit_exceeded)';

	it('asks for one more row than the page, in the order the cursor pages on', async () => {
		const requests: URL[] = [];
		const store = reader(async (url) => {
			requests.push(new URL(String(url)));
			return new Response(JSON.stringify(Array.from({ length: 26 }, (_, index) => ({ id: `log-${index}` }))), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});

		const page = await store.listLogs({ orgId: 'org-a', filters: {}, limit: 25 });

		expect(page.logs).toHaveLength(25);
		expect(page.hasMore).toBe(true);
		const [{ pathname, searchParams }] = requests;
		expect(pathname).toBe('/rest/v1/audit_logs');
		expect(searchParams.get('org_id')).toBe('eq.org-a');
		expect(searchParams.getAll('action')).toEqual([EXCLUDED]);
		expect(searchParams.get('select')).not.toMatch(/ip_address|user_agent/);
		expect(searchParams.get('order')).toBe('timestamp.desc,id.desc');
		expect(searchParams.get('limit')).toBe('26');
		expect(searchParams.has('offset')).toBe(false);
	});

	it('reports a page that fits as the last', async () => {
		const store = reader(
			async () =>
				new Response(JSON.stringify([{ id: 'only' }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
		);

		expect(await store.listLogs({ orgId: 'org-a', filters: {}, limit: 25 })).toEqual({
			logs: [{ id: 'only' }],
			hasMore: false
		});
	});

	it('sends each filter and the cursor as column conditions', async () => {
		let url!: URL;
		const store = reader(async (request) => {
			url = new URL(String(request));
			return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
		});

		await store.listLogs({
			orgId: 'org-a',
			filters: {
				personId: PERSON,
				userId: MEMBER,
				action: 'availability.deleted',
				since: '2026-03-01T00:00:00.000Z',
				until: '2026-04-01T00:00:00.000Z'
			},
			after: { timestamp: '2026-03-23T10:00:00.123456+00:00', id: CURSOR_ID },
			limit: 25
		});

		const { searchParams } = url;
		expect(searchParams.get('subject_personnel_id')).toBe(`eq.${PERSON}`);
		expect(searchParams.get('user_id')).toBe(`eq.${MEMBER}`);
		expect(searchParams.getAll('action')).toEqual([EXCLUDED, 'eq.availability.deleted']);
		expect(searchParams.getAll('timestamp')).toEqual([
			'gte.2026-03-01T00:00:00.000Z',
			'lt.2026-04-01T00:00:00.000Z',
			'lte.2026-03-23T10:00:00.123456+00:00'
		]);
		expect(searchParams.get('or')).toBe(`(timestamp.lt."2026-03-23T10:00:00.123456+00:00",id.lt."${CURSOR_ID}")`);
	});

	it('uses the scoped action RPC and removes empty or repeated saved action values', async () => {
		let requestBody: unknown;
		const store = reader(async (url, init) => {
			expect(new URL(String(url)).pathname).toBe('/rest/v1/rpc/list_audit_log_actions');
			requestBody = JSON.parse(String(init?.body));
			return new Response(
				JSON.stringify([
					{ action: 'training.updated' },
					{ action: null },
					{ action: '' },
					{ action: 'personnel.created' },
					{ action: 'training.updated' }
				]),
				{
					headers: { 'Content-Type': 'application/json' }
				}
			);
		});
		expect(await store.listActions('org-a')).toEqual(['personnel.created', 'training.updated']);
		expect(requestBody).toEqual({
			p_org_id: 'org-a',
			p_excluded_actions: [
				'auth.login_success',
				'auth.login_failure',
				'auth.mfa_verify',
				'security.rate_limit_violation',
				'security.rate_limit_exceeded'
			]
		});
	});

	it.each(['page', 'actions'] as const)(
		'%s provider errors cannot become successful empty results',
		async (operation) => {
			const store = reader(
				async () =>
					new Response(JSON.stringify({ message: 'private@example.test personnel note' }), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					})
			);
			const response =
				operation === 'page' ? store.listLogs({ orgId: 'org-a', filters: {}, limit: 100 }) : store.listActions('org-a');
			await expect(response).rejects.toThrow(/Organization Audit .+ failed/);
			await expect(response).rejects.not.toThrow(/private@example|personnel note/);
		}
	);
});
