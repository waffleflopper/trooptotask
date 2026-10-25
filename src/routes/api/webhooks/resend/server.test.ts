import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
import { POST } from './+server';

const secretBytes = 'synthetic-webhook-signing-secret';
const secret = `whsec_${Buffer.from(secretBytes).toString('base64')}`;
const now = new Date('2026-10-25T12:00:00Z');
const event = {
	type: 'email.bounced',
	created_at: '2026-10-25T11:59:00Z',
	data: { email_id: 'resend-123', bounce: { message: 'Mailbox does not exist' }, to: ['private@example.test'] }
};
function request(body: unknown = event, signing: 'valid' | 'bad' | 'missing' | 'old' = 'valid') {
	const raw = JSON.stringify(body);
	const timestamp = String(Math.floor(now.getTime() / 1000) - (signing === 'old' ? 3600 : 0));
	const id = 'msg_synthetic';
	const signature = createHmac('sha256', signing === 'bad' ? 'wrong-key' : secretBytes)
		.update(`${id}.${timestamp}.${raw}`)
		.digest('base64');
	return {
		request: new Request('https://app.example.test/api/webhooks/resend', {
			method: 'POST',
			body: raw,
			headers:
				signing === 'missing' ? {} : { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }
		})
	};
}

describe('Resend bounce endpoint', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(now);
		vi.stubEnv('RESEND_WEBHOOK_SECRET', secret);
		getAdminClient.mockReset();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});
	it.each(['missing', 'bad', 'old'] as const)('rejects a %s signature without database access', async (signing) => {
		const response = await POST(request(event, signing) as never);
		expect(response.status).toBe(401);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
	it('writes only bounce facts matched by the stored email ID and leaves replays unchanged', async () => {
		const row: Record<string, unknown> = {
			id: 'link-1',
			resend_email_id: 'resend-123',
			bounced_at: null,
			bounce_reason: null,
			claimed_at: null,
			revoked_at: null,
			expires_at: '2026-11-01T12:00:00Z'
		};
		const writes: unknown[] = [];
		const client = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
			auth: { persistSession: false },
			global: {
				fetch: async (input, init) => {
					const req = new Request(input, init);
					const url = new URL(req.url);
					expect(url.pathname).toBe('/rest/v1/account_setup_links');
					expect(url.searchParams.get('resend_email_id')).toBe('eq.resend-123');
					expect(url.searchParams.get('bounced_at')).toBe('is.null');
					const patch: unknown = await req.json();
					writes.push(patch);
					if (row.bounced_at === null) Object.assign(row, patch);
					return new Response(null, { status: 204 });
				}
			}
		});
		getAdminClient.mockReturnValue(client);
		expect((await POST(request() as never)).status).toBe(200);
		expect((await POST(request({ ...event, created_at: '2026-10-25T12:00:00Z' }) as never)).status).toBe(200);
		expect(writes[0]).toEqual({ bounced_at: '2026-10-25T11:59:00Z', bounce_reason: 'Mailbox does not exist' });
		expect(row).toEqual({
			id: 'link-1',
			resend_email_id: 'resend-123',
			bounced_at: '2026-10-25T11:59:00Z',
			bounce_reason: 'Mailbox does not exist',
			claimed_at: null,
			revoked_at: null,
			expires_at: '2026-11-01T12:00:00Z'
		});
	});
	it('accepts an unknown email ID as a no-op', async () => {
		getAdminClient.mockReturnValue(
			createClient('http://127.0.0.1:9', 'synthetic-service-key', {
				auth: { persistSession: false },
				global: { fetch: async () => new Response(null, { status: 204 }) }
			})
		);
		expect((await POST(request({ ...event, data: { ...event.data, email_id: 'unknown' } }) as never)).status).toBe(200);
	});
	it('ignores non-bounce events without database access', async () => {
		expect((await POST(request({ type: 'email.delivered' }) as never)).status).toBe(200);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
	it('fails safely without a signing secret', async () => {
		vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
		expect((await POST(request() as never)).status).toBe(503);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
