import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
import { createSupabaseAccountSetupLinkIssuancePorts } from './accountSetupLinkIssuanceSupabase.server';

const outbox = {
	id: 'outbox-1',
	access_request_id: 'request-1',
	setup_link_id: 'link-1',
	recipient: 'pat@example.test',
	purpose: 'account_setup',
	status: 'pending',
	attempt_count: 0,
	last_error: null,
	created_at: '2026-10-25',
	updated_at: '2026-10-25',
	sent_at: null
};

describe('setup delivery correlation', () => {
	beforeEach(() => {
		vi.stubEnv('RESEND_API_KEY', 'synthetic-key');
		vi.stubEnv('RESEND_FROM_EMAIL', 'sender@example.test');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ id: 'resend-synthetic' }))
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});
	it.each([false, true])('keeps the provider ID on the issued link, persistence failure=%s', async (failIdWrite) => {
		const writes: Array<{ path: string; values: unknown }> = [];
		const client = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
			auth: { persistSession: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					const values: unknown = await request.json();
					writes.push({ path: url.pathname, values });
					if (url.pathname === '/rest/v1/account_setup_links') {
						expect(url.searchParams.get('id')).toBe('eq.link-1');
						return failIdWrite
							? Response.json({ message: 'Database unavailable' }, { status: 500 })
							: new Response(null, { status: 204 });
					}
					if (url.pathname === '/rest/v1/auth_email_outbox')
						return Response.json({ ...outbox, ...(typeof values === 'object' ? values : {}) });
					throw new Error('Unexpected database effect');
				}
			}
		});
		const result = await createSupabaseAccountSetupLinkIssuancePorts(client).setupDelivery.send({
			accessRequestId: 'request-1',
			setupLinkId: 'link-1',
			email: 'pat@example.test',
			setupUrl: 'https://app.example.test/auth/setup-account?token=synthetic-token',
			expiresAt: new Date('2026-11-08')
		});
		expect(result.status).toBe(failIdWrite ? 'sent_recording_failed' : 'sent');
		expect(writes.filter((write) => write.path === '/rest/v1/account_setup_links')).toEqual([
			{ path: '/rest/v1/account_setup_links', values: { resend_email_id: 'resend-synthetic' } }
		]);
		expect(JSON.stringify(writes)).not.toContain('synthetic-token');
		expect(result.outbox.status).toBe('sent');
		expect(writes.filter((write) => write.path === '/rest/v1/auth_email_outbox')).toEqual([
			expect.objectContaining({ values: expect.objectContaining({ status: 'pending' }) }),
			expect.objectContaining({ values: expect.objectContaining({ status: 'sent' }) })
		]);
	});
});
