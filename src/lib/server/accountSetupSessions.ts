import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

export const ACCOUNT_SETUP_SESSION_COOKIE = 'ttt_account_setup_session';
export const ACCOUNT_SETUP_SESSION_MAX_AGE_SECONDS = 10 * 60;

export interface AccountSetupSession {
	setupLinkId: string;
	accessRequestId: string;
	expiresAt: number;
}

interface AccountSetupSessionPayload extends AccountSetupSession {
	version: 1;
}

function getSessionSecret(): string {
	const secret =
		env.ACCOUNT_SETUP_SESSION_SECRET ??
		process.env.ACCOUNT_SETUP_SESSION_SECRET ??
		env.SUPABASE_SERVICE_ROLE_KEY ??
		process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (secret) return secret;
	if (import.meta.env.DEV) return 'dev-account-setup-session-secret';
	throw new Error('ACCOUNT_SETUP_SESSION_SECRET is required for account setup sessions');
}

function encodeBase64Url(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
	return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(encodedPayload: string): string {
	return createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url');
}

function verifySignature(encodedPayload: string, signature: string): boolean {
	const expected = Buffer.from(sign(encodedPayload), 'base64url');
	const actual = Buffer.from(signature, 'base64url');
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function encodeSession(session: AccountSetupSession): string {
	const payload: AccountSetupSessionPayload = { version: 1, ...session };
	const encodedPayload = encodeBase64Url(JSON.stringify(payload));
	return `${encodedPayload}.${sign(encodedPayload)}`;
}

function decodeSession(value: string, now: Date): AccountSetupSession | null {
	const [encodedPayload, signature] = value.split('.');
	if (!encodedPayload || !signature || !verifySignature(encodedPayload, signature)) {
		return null;
	}

	const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<AccountSetupSessionPayload>;
	if (
		payload.version !== 1 ||
		typeof payload.setupLinkId !== 'string' ||
		typeof payload.accessRequestId !== 'string' ||
		typeof payload.expiresAt !== 'number'
	) {
		return null;
	}

	if (payload.expiresAt <= now.getTime()) {
		return null;
	}

	return {
		setupLinkId: payload.setupLinkId,
		accessRequestId: payload.accessRequestId,
		expiresAt: payload.expiresAt
	};
}

export function createAccountSetupSession(input: { setupLinkId: string; accessRequestId: string; now?: Date }) {
	const now = input.now ?? new Date();
	return {
		setupLinkId: input.setupLinkId,
		accessRequestId: input.accessRequestId,
		expiresAt: now.getTime() + ACCOUNT_SETUP_SESSION_MAX_AGE_SECONDS * 1000
	};
}

export function setAccountSetupSessionCookie(cookies: Pick<Cookies, 'set'>, session: AccountSetupSession): void {
	cookies.set(ACCOUNT_SETUP_SESSION_COOKIE, encodeSession(session), {
		path: '/auth/setup-account',
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		maxAge: ACCOUNT_SETUP_SESSION_MAX_AGE_SECONDS
	});
}

export function readAccountSetupSessionCookie(
	cookies: Pick<Cookies, 'get'>,
	now: Date = new Date()
): AccountSetupSession | null {
	const value = cookies.get(ACCOUNT_SETUP_SESSION_COOKIE);
	if (!value) return null;

	try {
		return decodeSession(value, now);
	} catch {
		return null;
	}
}

export function clearAccountSetupSessionCookie(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(ACCOUNT_SETUP_SESSION_COOKIE, {
		path: '/auth/setup-account'
	});
}
