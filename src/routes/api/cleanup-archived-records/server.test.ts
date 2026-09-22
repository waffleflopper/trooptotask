import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { GET } from './+server';

const { getAdminClient, from, select, env } = vi.hoisted(() => ({
	getAdminClient: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	env: { CLEANUP_SECRET: 'synthetic-retention-secret', CRON_SECRET: 'synthetic-shared-cron-secret' }
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
vi.mock('$env/dynamic/private', () => ({ env }));

function request(authorization?: string) {
	return {
		request: new Request('https://example.test/api/cleanup-archived-records', {
			headers: authorization ? { authorization } : {}
		})
	} as RequestEvent;
}

describe('scheduled archive cleanup admission', () => {
	beforeEach(() => {
		getAdminClient.mockReset().mockReturnValue({ from });
		from.mockReset().mockReturnValue({ select });
		select.mockReset().mockResolvedValue({ data: [], error: null });
	});

	it.each([undefined, 'Bearer incorrect-secret'])('rejects %s before opening the admin client', async (header) => {
		await expect(GET(request(header))).rejects.toMatchObject({ status: 401 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('allows the configured cron secret to run the empty scoped cleanup', async () => {
		const response = await GET(request('Bearer synthetic-retention-secret'));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ deletedCount: 0, orgsAffected: 0 });
		expect(from).toHaveBeenCalledWith('organizations');
	});
});
