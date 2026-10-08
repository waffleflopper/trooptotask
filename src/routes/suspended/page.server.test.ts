import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

function event(user: { id: string } | null, rpcResult: { data: unknown; error: unknown }) {
	const rpc = vi.fn().mockResolvedValue(rpcResult);
	return { rpc, event: { locals: { user, supabase: { rpc } } } as never };
}

describe('suspended page server', () => {
	it('sends a signed-out visitor to sign in without reading status', async () => {
		const { rpc, event: request } = event(null, { data: true, error: null });
		await expect(load(request)).rejects.toMatchObject({ status: 302, location: '/auth/login' });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('keeps a suspended account on the notice', async () => {
		const { rpc, event: request } = event({ id: 'user-1' }, { data: true, error: null });
		await expect(load(request)).resolves.toBeUndefined();
		expect(rpc).toHaveBeenCalledWith('is_user_suspended', { check_user_id: 'user-1' });
	});

	it.each([
		['an active account', { data: false, error: null }],
		['an unverifiable status', { data: null, error: { message: 'unavailable' } }]
	])('redirects %s to the dashboard', async (_case, result) => {
		const { event: request } = event({ id: 'user-1' }, result);
		await expect(load(request)).rejects.toMatchObject({ status: 302, location: '/dashboard' });
	});
});
