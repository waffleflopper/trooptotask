import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOnboardingReconciliationPort } from './onboardingReconciliationProvider.server';

function client(fetch: typeof globalThis.fetch) {
	return createClient('http://127.0.0.1:9', 'synthetic-offline-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: 'Bearer synthetic-request-actor' }, fetch }
	});
}

describe('Supabase Onboarding reconciliation provider', () => {
	it.each([null, 'template-new'])(
		'reconciles with the ordinary actor and an explicit template selection %s',
		async (newTemplateId) => {
			const port = createSupabaseOnboardingReconciliationPort(
				client(async (input, init) => {
					const url = new URL(String(input));
					expect(url.pathname).toBe('/rest/v1/rpc/reconcile_onboarding_packet');
					expect(init?.method).toBe('POST');
					expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-request-actor');
					expect(JSON.parse(String(init?.body))).toEqual({
						p_organization_id: 'org-1',
						p_onboarding_id: 'packet-1',
						p_new_template_id: newTemplateId
					});
					return Response.json({
						onboarding_id: 'packet-1',
						template_id: newTemplateId ?? 'template-current',
						old_template_id: 'template-previous',
						steps: []
					});
				})
			);
			const result = await port.reconcile('org-1', 'packet-1', newTemplateId);
			expect(result.template_id).toBe(newTemplateId ?? 'template-current');
		}
	);

	it.each([
		{ code: '42501', status: 403 },
		{ code: 'P0002', status: 404 },
		{ code: 'P0001', status: 400 }
	])('maps SQLSTATE $code to the public $status error', async ({ code, status }) => {
		const port = createSupabaseOnboardingReconciliationPort(
			client(async () =>
				Response.json(
					{
						code,
						message: 'Reconciliation rejected',
						details: null,
						hint: null
					},
					{ status: 400 }
				)
			)
		);
		await expect(port.reconcile('org-1', 'packet-1', null)).rejects.toMatchObject({
			status,
			message: 'Reconciliation rejected'
		});
	});

	it('leaves unexpected database failures as genuine server errors', async () => {
		const port = createSupabaseOnboardingReconciliationPort(
			client(async () =>
				Response.json(
					{
						code: '23505',
						message: 'Database constraint failure',
						details: null,
						hint: null
					},
					{ status: 409 }
				)
			)
		);
		const error = await port.reconcile('org-1', 'packet-1', null).catch((error: unknown) => error);
		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ message: 'Database constraint failure' });
		expect(error).not.toHaveProperty('status');
	});

	it('rejects an empty success response instead of reporting a reconciliation', async () => {
		const port = createSupabaseOnboardingReconciliationPort(client(async () => Response.json(null)));
		await expect(port.reconcile('org-1', 'packet-1', null)).rejects.toThrow(
			'Onboarding reconciliation returned no packet'
		);
	});
});
