import { describe, expect, it, vi } from 'vitest';
import { checkAdminAuthEmailRateLimit } from './accountEmailRateLimit.server';
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('admin auth email rate limit', () => {
	it('limits repeated emails per target and action across requests', async () => {
		const counts = new Map<string, number>();
		const rpc = vi.fn(async (_name: string, args: { p_bucket_key: string; p_max_requests: number }) => {
			const count = (counts.get(args.p_bucket_key) ?? 0) + 1;
			counts.set(args.p_bucket_key, count);
			return {
				data: { limited: count > args.p_max_requests, retry_after_ms: count > args.p_max_requests ? 60_000 : 0 },
				error: null
			};
		});
		const supabase = { rpc } as never;
		const otherUser = '22222222-2222-4222-8222-222222222222';

		for (let attempt = 0; attempt < 3; attempt++) {
			await expect(checkAdminAuthEmailRateLimit(supabase, USER_ID, 'recovery')).resolves.toBe(false);
		}
		await expect(checkAdminAuthEmailRateLimit(supabase, USER_ID, 'recovery')).resolves.toBe(true);
		await expect(checkAdminAuthEmailRateLimit(supabase, USER_ID, 'invite')).resolves.toBe(false);
		await expect(checkAdminAuthEmailRateLimit(supabase, otherUser, 'recovery')).resolves.toBe(false);
		expect([...counts.keys()]).toHaveLength(3);
	});
});
