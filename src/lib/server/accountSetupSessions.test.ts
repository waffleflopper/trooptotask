import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ACCOUNT_SETUP_SESSION_COOKIE,
	ACCOUNT_SETUP_SESSION_MAX_AGE_SECONDS,
	createAccountSetupSession,
	readAccountSetupSessionCookie,
	setAccountSetupSessionCookie
} from './accountSetupSessions';

function makeCookieJar() {
	const values = new Map<string, string>();
	return {
		values,
		cookies: {
			get: (name: string) => values.get(name),
			set: (name: string, value: string) => {
				values.set(name, value);
			}
		}
	};
}

describe('Account Setup sessions', () => {
	beforeEach(() => {
		process.env.ACCOUNT_SETUP_SESSION_SECRET = 'test-account-setup-session-secret';
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	});

	it('round-trips a signed setup session through the HTTP-only cookie value', () => {
		const jar = makeCookieJar();
		const now = new Date('2026-05-18T12:00:00.000Z');
		const session = createAccountSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			now
		});

		setAccountSetupSessionCookie(jar.cookies, session);

		expect(jar.values.get(ACCOUNT_SETUP_SESSION_COOKIE)).toBeTruthy();
		expect(readAccountSetupSessionCookie(jar.cookies, new Date('2026-05-18T12:01:00.000Z'))).toEqual({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			expiresAt: now.getTime() + ACCOUNT_SETUP_SESSION_MAX_AGE_SECONDS * 1000
		});
	});

	it('rejects tampered session payloads', () => {
		const jar = makeCookieJar();
		setAccountSetupSessionCookie(
			jar.cookies,
			createAccountSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				now: new Date('2026-05-18T12:00:00.000Z')
			})
		);
		const original = jar.values.get(ACCOUNT_SETUP_SESSION_COOKIE);
		expect(original).toBeTruthy();
		const [payload, signature] = original!.split('.');
		const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
		decoded.accessRequestId = 'request-2';
		const tamperedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
		jar.values.set(ACCOUNT_SETUP_SESSION_COOKIE, `${tamperedPayload}.${signature}`);

		expect(readAccountSetupSessionCookie(jar.cookies, new Date('2026-05-18T12:01:00.000Z'))).toBeNull();
	});

	it('rejects expired setup sessions', () => {
		const jar = makeCookieJar();
		setAccountSetupSessionCookie(
			jar.cookies,
			createAccountSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				now: new Date('2026-05-18T12:00:00.000Z')
			})
		);

		expect(readAccountSetupSessionCookie(jar.cookies, new Date('2026-05-18T12:10:00.001Z'))).toBeNull();
	});

	it('rejects malformed session values', () => {
		const jar = makeCookieJar();
		for (const value of ['not-a-session', 'payload.signature.extra', '.', '']) {
			jar.values.set(ACCOUNT_SETUP_SESSION_COOKIE, value);
			expect(readAccountSetupSessionCookie(jar.cookies, new Date('2026-05-18T12:01:00.000Z'))).toBeNull();
		}
	});

	it('does not accept Supabase service role key as a setup session signing fallback', () => {
		delete process.env.ACCOUNT_SETUP_SESSION_SECRET;
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-must-not-sign-setup-sessions';
		const jar = makeCookieJar();
		const payload = Buffer.from(
			JSON.stringify({
				version: 1,
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				expiresAt: new Date('2026-05-18T12:10:00.000Z').getTime()
			}),
			'utf8'
		).toString('base64url');
		const serviceRoleSignature = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY)
			.update(payload)
			.digest('base64url');
		jar.values.set(ACCOUNT_SETUP_SESSION_COOKIE, `${payload}.${serviceRoleSignature}`);

		expect(readAccountSetupSessionCookie(jar.cookies, new Date('2026-05-18T12:01:00.000Z'))).toBeNull();
	});
});
