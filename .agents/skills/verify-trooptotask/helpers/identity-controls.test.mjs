import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
	accountSetupSeed,
	authConfirmUrl,
	faultRequest,
	identityEmails,
	mailKind,
	mailRequest,
	readAccessRequests,
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

test('mail commands shape the supervisor request and refuse anything else', () => {
	assert.equal(mailKind('setup'), 'account-setup');
	assert.equal(mailKind('invitation'), 'invitation');
	assert.equal(mailKind('auth'), 'auth');
	assert.throws(() => mailKind('account-setup'));
	assert.deepEqual(mailRequest(['state']), { command: 'mail', action: 'state' });
	assert.deepEqual(mailRequest(['restore']), { command: 'mail', action: 'restore' });
	assert.deepEqual(mailRequest(['fail']), { command: 'mail', action: 'fail' });
	assert.deepEqual(mailRequest(['fail', '3']), { command: 'mail', action: 'fail', count: 3 });
	assert.deepEqual(mailRequest(['fail', 'setup']), { command: 'mail', action: 'fail', kind: 'account-setup' });
	assert.deepEqual(mailRequest(['fail', 'invitation', '2']), {
		command: 'mail',
		action: 'fail',
		kind: 'invitation',
		count: 2
	});
	for (const args of [
		[],
		['state', 'x'],
		['fail', 'confirm'],
		['fail', 'setup', 'invitation'],
		['fail', '1', 'setup'],
		['arm']
	])
		assert.throws(() => mailRequest(args), /Use mail/);
});

test('fault commands accept only the named provider faults', () => {
	assert.deepEqual(faultRequest(['state']), { command: 'fault', action: 'state' });
	assert.deepEqual(faultRequest(['restore']), { command: 'fault', action: 'restore' });
	assert.deepEqual(faultRequest(['arm', 'setup-link-create']), {
		command: 'fault',
		action: 'arm',
		name: 'setup-link-create'
	});
	assert.deepEqual(faultRequest(['arm', 'invitation-block', '2']), {
		command: 'fault',
		action: 'arm',
		name: 'invitation-block',
		ordinal: 2
	});
	for (const args of [
		[],
		['arm'],
		['arm', 'account_setup_links'],
		['state', 'x'],
		['arm', 'invitation-block', '1', '2']
	])
		assert.throws(() => faultRequest(args), /Use fault/);
});

function accessClient() {
	const selects = [];
	const tables = {
		access_requests: [{ id: 'r1', email: 'a@example.test', status: 'approved', reviewed_by: 'u1' }],
		account_setup_links: [{ id: 'l1', access_request_id: 'r1' }],
		access_request_organization_invitation_links: [
			{ id: 'k1', access_request_id: 'r1', organization_invitation_id: 'i1' },
			{ id: 'k2', access_request_id: 'r1', organization_invitation_id: 'i2' }
		],
		organization_invitations: [{ id: 'i1', status: 'blocked' }]
	};
	const client = {
		selects,
		from(table) {
			const query = {
				select(columns) {
					selects.push([table, columns]);
					return query;
				},
				eq: () => query,
				order: () => query,
				in: () => query,
				then: (resolve) => resolve({ data: tables[table], error: null })
			};
			return query;
		}
	};
	return client;
}

test('access-request readback adds review, invitation bridge rows and invitation status without token hashes', async () => {
	const client = accessClient();
	const result = await readAccessRequests(client, 'a@example.test');
	assert.equal(result.count, 1);
	assert.equal(result.rows[0].reviewed_by, 'u1');
	assert.deepEqual(
		result.invitationLinks.map(({ id, invitation_status }) => [id, invitation_status]),
		[
			['k1', 'blocked'],
			['k2', null]
		]
	);
	assert.equal(
		client.selects.some(([, columns]) => columns.includes('token_hash')),
		false
	);
});
