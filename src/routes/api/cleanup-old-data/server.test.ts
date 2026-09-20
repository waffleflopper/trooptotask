import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { GET } from './+server';

const { rpc, env } = vi.hoisted(() => ({
	rpc: vi.fn(),
	env: { CLEANUP_SECRET: 'synthetic-cleanup-secret', CRON_SECRET: 'synthetic-cron-secret' }
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc }) }));
vi.mock('$env/dynamic/private', () => ({ env }));

function request(authorization?: string) {
	return {
		request: new Request('https://example.test/api/cleanup-old-data', {
			headers: authorization ? { authorization } : {}
		})
	} as RequestEvent;
}

describe('scheduled audit cleanup', () => {
	beforeEach(() => {
		rpc.mockReset();
		rpc.mockResolvedValue({ data: 3, error: null });
	});

	it.each(['synthetic-cleanup-secret', 'synthetic-cron-secret'])(
		'permits the configured credential %s to clean audit logs only',
		async (secret) => {
			const response = await GET(request(`Bearer ${secret}`));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ auditLogsDeleted: 3 });
			// No other stored records, including the retired webhook ledger, may be deleted.
			expect(rpc.mock.calls).toEqual([['cleanup_old_audit_logs']]);
		}
	);

	it.each([undefined, 'Bearer incorrect-secret'])('rejects unauthorized cleanup before mutation', async (header) => {
		await expect(GET(request(header))).rejects.toMatchObject({ status: 401 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('reports audit cleanup failure instead of a successful deletion count', async () => {
		rpc.mockResolvedValue({ data: null, error: { message: 'synthetic persistence failure' } });
		await expect(GET(request('Bearer synthetic-cron-secret'))).rejects.toMatchObject({ status: 500 });
	});
});
