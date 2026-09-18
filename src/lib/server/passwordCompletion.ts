import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import type { PasswordCompletionState } from '$lib/auth/passwordCompletion';

export const PASSWORD_COMPLETION_COOKIE = 'ttt_password_completion';
type Flow = 'recovery' | 'invite' | null;
type Receipt = {
	version: 1;
	actor: string;
	session: string;
	flow: Flow;
	expiresAt: number;
	state: 'pending' | 'complete';
};
type Identity = Pick<App.Locals, 'user' | 'session'>;

function sign(value: string): string {
	const secret = env.ACCOUNT_SETUP_SESSION_SECRET ?? process.env.ACCOUNT_SETUP_SESSION_SECRET;
	if (!secret) throw new Error('Password completion signing unavailable');
	return createHmac('sha256', secret)
		.update('password-completion:v1:' + value)
		.digest('base64url');
}
function sessionId(locals: Identity): string {
	// This is the token already verified by request admission, never a request-body token.
	const claims = JSON.parse(Buffer.from(locals.session!.access_token.split('.')[1], 'base64url').toString());
	if (
		claims.sub !== locals.user?.id ||
		typeof claims.session_id !== 'string' ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id)
	)
		throw new Error('Session binding unavailable');
	return claims.session_id;
}
export function preparePasswordCompletion(locals: Identity & { authFlow?: Flow }): Receipt {
	const receipt: Receipt = {
		version: 1,
		actor: locals.user!.id,
		session: sessionId(locals),
		flow: locals.authFlow ?? null,
		expiresAt: locals.session!.expires_at!,
		state: 'pending'
	};
	// Verify signing availability before any password mutation.
	sign(JSON.stringify(receipt));
	return receipt;
}
export function writePasswordCompletion(cookies: Pick<Cookies, 'set'>, receipt: Receipt): void {
	const encoded = Buffer.from(JSON.stringify(receipt)).toString('base64url');
	cookies.set(PASSWORD_COMPLETION_COOKIE, `${encoded}.${sign(encoded)}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		// Keep the expired marker until sign-in or explicit completed-flow restart;
		// silently expiring it would invite another password mutation on reload.
		maxAge: 24 * 60 * 60
	});
}
export function readPasswordCompletion(
	cookies: Pick<Cookies, 'get'>,
	locals: Identity
): Receipt | 'expired' | 'unavailable' | null {
	const value = cookies.get(PASSWORD_COMPLETION_COOKIE);
	if (!value || !locals.user || !locals.session) return null;
	if (value.length > 2048) return 'unavailable';
	try {
		const parts = value.split('.');
		if (parts.length !== 2) return 'unavailable';
		const expected = Buffer.from(sign(parts[0]));
		const actual = Buffer.from(parts[1]);
		if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return 'unavailable';
		const receipt = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as Receipt;
		if (
			receipt.version !== 1 ||
			!['pending', 'complete'].includes(receipt.state) ||
			![null, 'recovery', 'invite'].includes(receipt.flow) ||
			typeof receipt.actor !== 'string' ||
			typeof receipt.session !== 'string' ||
			typeof receipt.expiresAt !== 'number' ||
			!Number.isFinite(receipt.expiresAt)
		)
			return 'unavailable';
		if (receipt.actor !== locals.user.id || receipt.session !== sessionId(locals)) return null;
		if (receipt.expiresAt <= Date.now() / 1000) return 'expired';
		return receipt;
	} catch {
		return 'unavailable';
	}
}
export function passwordCompletionState(cookies: Pick<Cookies, 'get'>, locals: Identity): PasswordCompletionState {
	const receipt = readPasswordCompletion(cookies, locals);
	return typeof receipt === 'object' ? (receipt?.state ?? null) : receipt;
}
