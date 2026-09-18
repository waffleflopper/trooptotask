import { afterEach, expect, it, vi } from 'vitest';
import { actions } from './+page.server';

const { audit } = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock('$lib/server/auditLog', () => ({ auditLog: audit }));
afterEach(() => vi.restoreAllMocks());

const success = () => ({
	data: {
		user: { id: 'user-a' },
		session: { user: { id: 'user-a' }, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }
	},
	error: null
});

function fixture() {
	audit.mockClear();
	const signInWithPassword = vi.fn().mockResolvedValue(success());
	const getAuthenticatorAssuranceLevel = vi
		.fn()
		.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
	const form = new FormData();
	form.set('email', '  OWNER@EXAMPLE.TEST  ');
	form.set('password', '  exact password  ');
	form.set('next', '/account/security');
	const run = (request = new Request('http://app.invalid/auth/login?/login', { method: 'POST', body: form })) =>
		actions.login({
			request,
			locals: { supabase: { auth: { signInWithPassword, mfa: { getAuthenticatorAssuranceLevel } } } }
		} as unknown as Parameters<typeof actions.login>[0]);
	return { form, signInWithPassword, getAuthenticatorAssuranceLevel, run };
}

it.each([
	'missing email',
	'missing password',
	'blank email',
	'invalid email',
	'long email',
	'email file',
	'password file',
	'duplicate email'
])('rejects %s before creating any authentication session', async (kind) => {
	const f = fixture();
	if (kind === 'missing email') f.form.delete('email');
	if (kind === 'missing password') f.form.delete('password');
	if (kind === 'blank email') f.form.set('email', '   ');
	if (kind === 'invalid email') f.form.set('email', 'not-an-address');
	if (kind === 'long email') f.form.set('email', 'a'.repeat(250) + '@example.test');
	if (kind === 'email file') f.form.set('email', new File(['owner@example.test'], 'email.txt'));
	if (kind === 'password file') f.form.set('password', new File(['password'], 'password.txt'));
	if (kind === 'duplicate email') f.form.append('email', 'different@example.test');
	expect(await f.run()).toMatchObject({ status: 400 });
	expect(f.signInWithPassword).not.toHaveBeenCalled();
	expect(f.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
	expect(audit).not.toHaveBeenCalled();
});

it('rejects malformed form encoding before authentication', async () => {
	const f = fixture();
	expect(
		await f.run(
			new Request('http://app.invalid/auth/login?/login', {
				method: 'POST',
				headers: { 'content-type': 'multipart/form-data; boundary=missing' },
				body: 'not multipart'
			})
		)
	).toMatchObject({ status: 400 });
	expect(f.signInWithPassword).not.toHaveBeenCalled();
});

it('normalizes email but preserves password bytes and audits accepted authentication', async () => {
	const f = fixture();
	await expect(f.run()).rejects.toMatchObject({ status: 303, location: '/account/security' });
	expect(f.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.test', password: '  exact password  ' });
	expect(audit.mock.calls.map(([event]) => event.action)).toEqual(['auth.login_success']);
	expect(JSON.stringify(audit.mock.calls)).not.toContain('exact password');
});

it.each(['missing data', 'missing session', 'missing token', 'wrong identity', 'error with data'])(
	'does not report login success for %s',
	async (kind) => {
		const f = fixture();
		const valid = success();
		const results: Record<string, unknown> = {
			'missing data': { data: null, error: null },
			'missing session': { data: { user: valid.data.user, session: null }, error: null },
			'missing token': { data: { ...valid.data, session: { ...valid.data.session, access_token: '' } }, error: null },
			'wrong identity': {
				data: { ...valid.data, session: { ...valid.data.session, user: { id: 'other-user' } } },
				error: null
			},
			'error with data': { ...valid, error: { message: 'private provider detail' } }
		};
		f.signInWithPassword.mockResolvedValueOnce(results[kind]);
		const response = await f.run();
		expect(response).toMatchObject({ status: kind === 'error with data' ? 400 : 503 });
		expect(f.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
		expect(audit.mock.calls.map(([event]) => event.action)).not.toContain('auth.login_success');
		expect(JSON.stringify(response)).not.toContain('private provider detail');
	}
);

it.each(['null', 'unknown', 'error with data', 'exception'])(
	'keeps login incomplete after %s assurance and permits a verified retry',
	async (kind) => {
		const f = fixture();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		if (kind === 'exception')
			f.getAuthenticatorAssuranceLevel.mockRejectedValueOnce(new Error('private provider detail'));
		else
			f.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
				data: kind === 'null' ? null : { currentLevel: kind === 'unknown' ? 'future' : 'aal1', nextLevel: 'aal1' },
				error: kind === 'error with data' ? { message: 'private provider detail' } : null
			});
		expect(await f.run()).toMatchObject({
			status: 503,
			data: { email: 'owner@example.test', nextPath: '/account/security' }
		});
		expect(audit.mock.calls.map(([event]) => event.action)).not.toContain('auth.login_success');
		expect(JSON.stringify(log.mock.calls)).not.toContain('private provider detail');
		await expect(f.run()).rejects.toMatchObject({ status: 303, location: '/account/security' });
	}
);

it('contains a thrown authentication failure without logging credentials and preserves retry state', async () => {
	const f = fixture();
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	f.signInWithPassword.mockRejectedValueOnce(new Error('password=secret provider detail'));
	const result = await f.run();
	expect(result).toMatchObject({ status: 503, data: { email: 'owner@example.test', nextPath: '/account/security' } });
	expect(JSON.stringify([result, log.mock.calls, audit.mock.calls])).not.toContain('secret provider detail');
	await expect(f.run()).rejects.toMatchObject({ status: 303 });
});

it('reports a provider outage as unavailable rather than invalid credentials', async () => {
	const f = fixture();
	f.signInWithPassword.mockResolvedValueOnce({
		data: null,
		error: { status: 500, message: 'private provider detail' }
	});
	const result = await f.run();
	expect(result).toMatchObject({ status: 503, data: { email: 'owner@example.test' } });
	expect(JSON.stringify(result)).not.toContain('private provider detail');
	expect(f.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
	expect(audit.mock.calls.map(([event]) => event.action)).toEqual(['auth.login_failure']);
});
