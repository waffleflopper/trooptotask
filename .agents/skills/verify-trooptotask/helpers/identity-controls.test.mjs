import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authConfirmUrl, redactAuthTokens, syntheticEmail, textboxUid } from './identity-controls.mjs';

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
