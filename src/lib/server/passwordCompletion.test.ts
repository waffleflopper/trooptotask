import { afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { passwordSessionToken } from '../../tests/fixtures/passwordSession';
import {
	PASSWORD_COMPLETION_COOKIE,
	passwordCompletionState,
	preparePasswordCompletion,
	writePasswordCompletion
} from './passwordCompletion';
vi.mock('$env/dynamic/private', () => ({ env: { ACCOUNT_SETUP_SESSION_SECRET: 'synthetic-receipt-secret' } }));
afterEach(() => {
	env.ACCOUNT_SETUP_SESSION_SECRET = 'synthetic-receipt-secret';
	vi.unstubAllEnvs();
});
const locals = () =>
	({
		user: { id: 'actor' },
		session: { access_token: passwordSessionToken('actor'), expires_at: Date.now() / 1000 + 60 },
		authFlow: 'invite'
	}) as App.Locals;
it('keeps the receipt private, scoped and separate from account-setup signatures without storing a password', () => {
	const jar = new Map<string, string>();
	const set = vi.fn((name: string, value: string) => {
		jar.set(name, value);
	});
	const identity = locals();
	writePasswordCompletion({ set }, preparePasswordCompletion(identity));
	expect(set).toHaveBeenCalledWith(
		PASSWORD_COMPLETION_COOKIE,
		expect.any(String),
		expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', secure: !import.meta.env.DEV, maxAge: 86400 })
	);
	expect(passwordCompletionState({ get: (name) => jar.get(name) }, identity)).toBe('pending');
	const encoded = jar.get(PASSWORD_COMPLETION_COOKIE)!.split('.')[0];
	const wrongContext = createHmac('sha256', 'synthetic-receipt-secret').update(encoded).digest('base64url');
	expect(passwordCompletionState({ get: () => `${encoded}.${wrongContext}` }, identity)).toBe('unavailable');
});
it('requires a configured signer before preparing a password mutation', () => {
	delete env.ACCOUNT_SETUP_SESSION_SECRET;
	vi.stubEnv('ACCOUNT_SETUP_SESSION_SECRET', undefined);
	expect(() => preparePasswordCompletion(locals())).toThrow('signing unavailable');
});
it.each(['opaque', 'e30.e30.signature', passwordSessionToken('different')])(
	'does not bind a receipt to an unusable admitted token %#',
	(access_token) => {
		const identity = locals();
		identity.session!.access_token = access_token;
		expect(() => preparePasswordCompletion(identity)).toThrow();
	}
);
it.each(['not-a-receipt', 'one.two.three', 'x'.repeat(2049)])('blocks malformed received receipts %#', (value) => {
	expect(passwordCompletionState({ get: () => value }, locals())).toBe('unavailable');
});
