import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
	accountSetupSeed,
	authConfirmUrl,
	identityEmails,
	redactAuthTokens,
	setupAccountUrl,
	syntheticEmail,
	textboxUid
} from './identity-controls.mjs';

const security = [
	'uid=1_4 textbox "Current password"',
	'uid=1_9 textbox "Current password"',
	'uid=1_10 textbox "New password"'
].join('\n');

test('textboxUid selects one labelled field or an explicit occurrence', () => {
	assert.equal(textboxUid(security, 'New password'), '1_10');
	assert.equal(textboxUid(security, 'Current password', 2), '1_9');
	assert.throws(() => textboxUid(security, 'Current password'), /found 2/);
	assert.throws(() => textboxUid(security, 'Current password', 3), /found 2/);
	assert.throws(() => textboxUid(security, 'Verification Code'), /found 0/);
});

test('authConfirmUrl builds the app confirmation link for each supported flow', () => {
	assert.equal(
		authConfirmUrl('http://127.0.0.1:4100', 'recovery', 'abc'),
		'http://127.0.0.1:4100/auth/confirm?type=recovery&next=%2Fauth%2Freset-password&token_hash=abc'
	);
	assert.equal(
		authConfirmUrl('http://127.0.0.1:4100', 'invite', 'abc'),
		'http://127.0.0.1:4100/auth/confirm?type=invite&next=%2Fauth%2Faccept-invite&token_hash=abc'
	);
	assert.throws(() => authConfirmUrl('http://127.0.0.1:4100', 'signup', 'abc'), /recovery or invite/);
});

test('redactAuthTokens removes link tokens and keeps the rest of a snapshot', () => {
	assert.equal(
		redactAuthTokens('RootWebArea url="http://127.0.0.1:4100/auth/confirm?type=recovery&token_hash=pkce_9f3a"'),
		'RootWebArea url="http://127.0.0.1:4100/auth/confirm?type=recovery&token_hash=[REDACTED]"'
	);
	assert.equal(redactAuthTokens('/auth/setup-account?token=s3cr3t&x=1'), '/auth/setup-account?token=[REDACTED]&x=1');
});

test('syntheticEmail lowercases synthetic addresses and rejects real domains', () => {
	assert.equal(syntheticEmail(' Access-Run1@Example.Test '), 'access-run1@example.test');
	assert.throws(() => syntheticEmail('person@example.com'), /synthetic/);
});

test("identityEmails exposes only the identity actors' synthetic addresses", () => {
	const fixture = {
		identityActors: ['identityMfa', 'identityRecovery'],
		actors: {
			identityMfa: { id: 'u1', email: 'identitymfa-1@example.test', password: 'secret-1' },
			identityRecovery: { id: 'u2', email: 'identityrecovery-2@example.test', password: 'secret-2' },
			manager: { id: 'u3', email: 'manager-3@example.test', password: 'secret-3' }
		}
	};
	assert.deepEqual(identityEmails(fixture), {
		identityMfa: 'identitymfa-1@example.test',
		identityRecovery: 'identityrecovery-2@example.test'
	});
});

test('accountSetupSeed stores each class as the app reads it and keeps only the token hash in the row', () => {
	const now = Date.parse('2026-10-09T12:00:00.000Z');
	const seed = accountSetupSeed('t1', now);
	const shape = Object.fromEntries(
		Object.entries(seed).map(([kind, { request, link }]) => [
			kind,
			{
				email: request.email,
				status: request.status,
				linked: link.access_request_id === request.id,
				expires_at: link.expires_at,
				claimed_at: link.claimed_at,
				failed_at: link.failed_at,
				failure_reason: link.failure_reason,
				revoked_at: link.revoked_at,
				revocation_reason: link.revocation_reason
			}
		])
	);
	const future = '2026-10-10T12:00:00.000Z';
	const recent = '2026-10-09T11:00:00.000Z';
	const base = { linked: true, expires_at: future, status: 'approved' };
	const none = {
		claimed_at: undefined,
		failed_at: undefined,
		failure_reason: undefined,
		revoked_at: undefined,
		revocation_reason: undefined
	};
	assert.deepEqual(shape, {
		valid: { ...base, ...none, email: 'setup-t1-valid@example.test' },
		claimed: { ...base, ...none, claimed_at: recent, email: 'setup-t1-claimed@example.test' },
		expired: { ...base, ...none, expires_at: '2026-10-08T12:00:00.000Z', email: 'setup-t1-expired@example.test' },
		replaced: {
			...base,
			...none,
			revoked_at: recent,
			revocation_reason: 'replaced',
			email: 'setup-t1-replaced@example.test'
		},
		failed: {
			...base,
			...none,
			claimed_at: recent,
			failed_at: recent,
			failure_reason: 'account-create-failed',
			email: 'setup-t1-failed@example.test'
		},
		'not-approved': { ...base, ...none, status: 'pending', email: 'setup-t1-not-approved@example.test' }
	});
	for (const { link, rawToken } of Object.values(seed)) {
		assert.equal(link.token_hash, createHash('sha256').update(rawToken).digest('hex'));
		assert.ok(!JSON.stringify(link).includes(rawToken));
	}
	assert.equal(new Set(Object.values(seed).map(({ rawToken }) => rawToken)).size, 6);
});

test('setupAccountUrl builds the setup email link and redaction removes its token', () => {
	const url = setupAccountUrl('http://127.0.0.1:4100', 'raw_Token-1');
	assert.equal(url, 'http://127.0.0.1:4100/auth/setup-account?token=raw_Token-1');
	assert.equal(redactAuthTokens(`url="${url}"`), 'url="http://127.0.0.1:4100/auth/setup-account?token=[REDACTED]"');
});
