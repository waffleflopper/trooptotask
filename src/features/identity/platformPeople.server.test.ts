import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { createIdentityPersonReader } from './platformPeople.server';

it('keeps actual delivery outcomes beside the link lifecycle in the setup timeline', async () => {
	const link = {
		id: 'link-1',
		created_at: '2026-10-24',
		expires_at: '2026-11-07',
		claimed_at: null,
		used_at: null,
		failed_at: null,
		failure_reason: null,
		revoked_at: null,
		revocation_reason: null,
		bounced_at: null,
		bounce_reason: null,
		deliveries: [
			{
				id: 'delivery-1',
				status: 'failed',
				attempt_count: 1,
				created_at: '2026-10-24',
				updated_at: '2026-10-24',
				sent_at: null,
				last_error: 'Provider rejected the email'
			}
		]
	};
	const client = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
		auth: { persistSession: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(new Request(input, init).url);
				expect(url.pathname).toBe('/rest/v1/account_setup_links');
				expect(url.searchParams.get('access_request_id')).toBe('eq.request-1');
				return Response.json([link]);
			}
		}
	});
	await expect(createIdentityPersonReader(client).setupTimeline('request-1')).resolves.toEqual([link]);
});
