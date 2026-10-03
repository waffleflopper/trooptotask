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
	it('bounds the admitted Organization page and counts all recent non-auth actions independently', async () => {
		const requests: Array<{ url: URL; method: string }> = [];
		const store = reader(async (url, init) => {
			const request = { url: new URL(String(url)), method: init?.method ?? 'GET' };
			requests.push(request);
			return request.method === 'HEAD'
				? new Response(null, { status: 200, headers: { 'Content-Range': '*/105' } })
				: new Response(JSON.stringify([{ id: 'saved-log', action: 'training.updated' }]), {
						status: 200,
						headers: { 'Content-Type': 'application/json', 'Content-Range': '25-25/106' }
					});
		});
		const page = await store.listLogs({ orgId: 'org-a', action: 'training.updated', offset: 25, limit: 25 });
		expect(page).toEqual({ logs: [{ id: 'saved-log', action: 'training.updated' }], totalCount: 106 });
		expect(await store.countRecent({ orgId: 'org-a', cutoff: '2026-09-02T12:00:00Z' })).toBe(105);
		for (const { url } of requests) {
			expect(url.pathname).toBe('/rest/v1/audit_logs');
			expect(url.searchParams.get('org_id')).toBe('eq.org-a');
			expect(url.searchParams.getAll('action')).toContain(
				'not.in.(auth.login_success,auth.login_failure,auth.mfa_verify,security.rate_limit_violation)'
			);
			expect(url.searchParams.get('select')).not.toMatch(/ip_address|user_agent/);
		}
		expect(requests[0].url.searchParams.get('offset')).toBe('25');
		expect(requests[0].url.searchParams.get('limit')).toBe('25');
		expect(requests[0].url.searchParams.get('order')).toBe('timestamp.desc');
		expect(requests[0].url.searchParams.getAll('action')).toContain('eq.training.updated');
		expect(requests[1].method).toBe('HEAD');
		expect(requests[1].url.searchParams.getAll('action')).toHaveLength(1);
		expect(requests[1].url.searchParams.get('timestamp')).toBe('gte.2026-09-02T12:00:00Z');
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
				'security.rate_limit_violation'
			]
		});
	});

	it.each(['page', 'recent count', 'actions'] as const)(
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
				operation === 'page'
					? store.listLogs({ orgId: 'org-a', offset: 0, limit: 100 })
					: operation === 'recent count'
						? store.countRecent({ orgId: 'org-a', cutoff: '2026-09-02' })
						: store.listActions('org-a');
			await expect(response).rejects.toThrow(/Organization Audit .+ failed/);
			await expect(response).rejects.not.toThrow(/private@example|personnel note/);
		}
	);
});
