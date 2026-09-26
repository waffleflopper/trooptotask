import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { createSupabaseAccountSetupLinkStore } from './accountSetupLinks.server';

it('releases a revoked held claim after a definite no-write rejection without releasing a used claim', async () => {
	const claimedAt = '2026-09-25T10:00:00.000Z';
	const revokedAt = '2026-09-25T10:01:00.000Z';
	const row = {
		id: 'link-1',
		access_request_id: 'request-1',
		token_hash: 'synthetic-hash',
		expires_at: '2026-10-09T10:00:00.000Z',
		created_at: '2026-09-25T09:00:00.000Z',
		claimed_at: claimedAt,
		failed_at: null as string | null,
		failure_reason: null as string | null,
		used_at: null as string | null,
		revoked_at: revokedAt,
		revocation_reason: 'manual'
	};
	const client = createClient('http://localhost:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				expect(url.pathname).toBe('/rest/v1/account_setup_links');
				expect(init?.method).toBe('PATCH');
				const filters = url.searchParams;
				const selected =
					filters.get('id') === `eq.${row.id}` &&
					(!filters.has('claimed_at') || (filters.get('claimed_at') === 'not.is.null' && row.claimed_at !== null)) &&
					(!filters.has('failed_at') || (filters.get('failed_at') === 'is.null' && row.failed_at === null)) &&
					(!filters.has('used_at') || (filters.get('used_at') === 'is.null' && row.used_at === null)) &&
					(!filters.has('revoked_at') || (filters.get('revoked_at') === 'is.null' && row.revoked_at === null));
				if (!selected) return Response.json([]);
				const change = JSON.parse(String(init?.body)) as { failed_at: string; failure_reason: string };
				row.failed_at = change.failed_at;
				row.failure_reason = change.failure_reason;
				return Response.json([row]);
			}
		}
	});
	const store = createSupabaseAccountSetupLinkStore(client);

	expect(await store.markFailed('link-1', new Date('2026-09-25T10:02:00.000Z'), 'account-create-failed')).toMatchObject(
		{
			id: 'link-1',
			failedAt: new Date('2026-09-25T10:02:00.000Z'),
			failureReason: 'account-create-failed',
			revokedAt: new Date(revokedAt)
		}
	);

	row.failed_at = null;
	row.failure_reason = null;
	row.used_at = '2026-09-25T10:03:00.000Z';
	expect(await store.markFailed('link-1', new Date('2026-09-25T10:04:00.000Z'), 'account-create-failed')).toBeNull();
});
