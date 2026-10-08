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

	it('redirects an active account to the dashboard', async () => {
		const { event: request } = event({ id: 'user-1' }, { data: false, error: null });
		await expect(load(request)).rejects.toMatchObject({ status: 302, location: '/dashboard' });
	});

	it('reports an unverifiable status as unavailable instead of admitting the account', async () => {
		const { event: request } = event({ id: 'user-1' }, { data: null, error: { message: 'unavailable' } });
		await expect(load(request)).rejects.toMatchObject({
			status: 500,
			body: { message: 'Unable to verify account status' }
		});
	});
});
