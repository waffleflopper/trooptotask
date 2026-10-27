import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	createMailSink,
	createProviderFaultController,
	openCapturedLink,
	redactLinkTokens
} from './outbound-controls.mjs';

const apiKey = 'a1'.repeat(24);
const providerUrl = 'http://127.0.0.1:56321';
const rawToken = 'RAW_SETUP_TOKEN_9f8e7d';
const setupUrl = `http://127.0.0.1:4100/auth/setup-account?token=${rawToken}`;
const renewUrl = 'http://127.0.0.1:4100/auth/renew-invite?email=new%40example.test';

function mailRequest({ to = ['New@Example.test'], subject, text, key = apiKey } = {}) {
	return [
		'https://api.resend.com/emails',
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: 'verify@example.test', to, subject, text, html: `<p>${text}</p>` })
		}
	];
}
const setupMail = (options) =>
	mailRequest({
		subject: 'Set up your TroopToTask account',
		text: `Set up your account here: ${setupUrl}\n`,
		...options
	});
const inviteMail = (options) =>
	mailRequest({
		subject: 'Invitation to join Alpha on TroopToTask',
		text: `Because you do not have an account yet:\nRequest a link ${renewUrl}\nUse that only if needed.`,
		...options
	});

function sink() {
	const passed = [];
	const mail = createMailSink({
		apiKey,
		fetch: async (...args) => {
			passed.push(args);
			return new Response('real');
		}
	});
	return { mail, passed };
}

test('captures each message with a synthetic success and classifies it from its content', async () => {
	const { mail, passed } = sink();
	const first = await mail.fetch(...setupMail());
	assert.equal(first.status, 200);
	assert.deepEqual(await first.json(), { id: 'synthetic-mail-1' });
	assert.equal((await mail.fetch(...inviteMail())).status, 200);
	assert.equal(passed.length, 0);
	const { messages, armed } = mail.command('mail-state');
	assert.equal(armed, null);
	assert.deepEqual(
		messages.map(({ sequence, to, subject, kind, delivery, paths }) => ({
			sequence,
			to,
			subject,
			kind,
			delivery,
			paths
		})),
		[
			{
				sequence: 1,
				to: ['new@example.test'],
				subject: 'Set up your TroopToTask account',
				kind: 'account-setup',
				delivery: 'delivered',
				paths: ['/auth/setup-account?token=[redacted]']
			},
			{
				sequence: 2,
				to: ['new@example.test'],
				subject: 'Invitation to join Alpha on TroopToTask',
				kind: 'invitation',
				delivery: 'delivered',
				paths: ['/auth/renew-invite?email=new%40example.test']
			}
		]
	);
	assert.match(messages[0].receivedAt, /^\d{4}-\d\d-\d\dT/);
	assert.equal(JSON.stringify(mail.command('mail-state')).includes(rawToken), false);
});

test('mail-link returns the newest delivered link of that kind for that recipient only', async () => {
	const { mail } = sink();
	await mail.fetch(...setupMail());
	await mail.fetch(...setupMail({ to: ['other@example.test'] }));
	const newest = `http://127.0.0.1:4100/auth/setup-account?token=${rawToken}-newest`;
	await mail.fetch(...mailRequest({ subject: 'Set up', text: `Set up your account here: ${newest}\n` }));
	assert.equal(mail.command('mail-link', { email: ' NEW@example.test ', kind: 'account-setup' }).link, newest);
	assert.equal(
		mail.command('mail-link', { email: 'new@example.test', kind: 'account-setup', ordinal: 2 }).link,
		setupUrl
	);
	assert.equal(
		mail.command('mail-link', { email: 'new@example.test', kind: 'account-setup', ordinal: 3 }).status,
		'BLOCKED'
	);
	assert.equal(mail.command('mail-link', { email: 'new@example.test', kind: 'invitation' }).status, 'BLOCKED');
	await mail.fetch(...inviteMail());
	assert.equal(mail.command('mail-link', { email: 'new@example.test', kind: 'invitation' }).link, renewUrl);
	assert.throws(() => mail.command('mail-link', { email: 'new@example.test', kind: 'setup' }));
	assert.throws(() => mail.command('mail-link', { email: 'new@example.test', kind: 'invitation', ordinal: 11 }));
});

test('an armed failure returns a synthetic 503 for the matching kind and count, then delivers again', async () => {
	const { mail } = sink();
	mail.command('mail-arm', { mode: 'fail', kind: 'account-setup', count: 2 });
	assert.throws(() => mail.command('mail-arm', { mode: 'fail' }));
	assert.equal((await mail.fetch(...inviteMail())).status, 200);
	for (let attempt = 0; attempt < 2; attempt++) {
		const failure = await mail.fetch(...setupMail());
		assert.equal(failure.status, 503);
		assert.equal((await failure.json()).message, 'Synthetic verification mail failure');
	}
	assert.equal((await mail.fetch(...setupMail())).status, 200);
	const { messages, armed } = mail.command('mail-state');
	assert.deepEqual(
		messages.map(({ kind, delivery }) => `${kind}:${delivery}`),
		['invitation:delivered', 'account-setup:failed', 'account-setup:failed', 'account-setup:delivered']
	);
	assert.deepEqual(armed, { kind: 'account-setup', remaining: 0, failed: 2 });
	assert.equal(mail.command('mail-link', { email: 'new@example.test', kind: 'account-setup' }).sequence, 4);
	assert.equal(mail.command('mail-restore').armed, null);
});

test('restore clears an armed failure before it fires; invalid arming is refused', async () => {
	const { mail } = sink();
	for (const options of [
		{},
		{ mode: 'fail', kind: 'confirm' },
		{ mode: 'fail', count: 0 },
		{ mode: 'fail', count: 11 }
	])
		assert.throws(() => mail.command('mail-arm', options));
	mail.command('mail-arm', { mode: 'fail' });
	mail.command('mail-restore');
	assert.equal((await mail.fetch(...setupMail())).status, 200);
});

test('only the exact Resend send with the owned bearer is intercepted', async () => {
	const { mail, passed } = sink();
	mail.command('mail-arm', { mode: 'fail', count: 10 });
	const ordinary = [
		setupMail({ key: 'b2'.repeat(24) }),
		['https://api.resend.com/emails', { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } }],
		['https://api.resend.com/domains', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }],
		['https://api.resend.com/emails?x=1', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }],
		['https://example.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }],
		['http://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }],
		['https://api.resend.com/emails', { method: 'POST' }],
		[`${providerUrl}/rest/v1/organizations`]
	];
	for (const input of ordinary) assert.equal(await (await mail.fetch(...input)).text(), 'real');
	assert.equal(passed.length, ordinary.length);
	assert.deepEqual(mail.command('mail-state').messages, []);
});

test('an unreadable message with the owned bearer is rejected locally and never recorded', async () => {
	const { mail, passed } = sink();
	const response = await mail.fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}` },
		body: 'not json'
	});
	assert.equal(response.status, 422);
	assert.equal(passed.length, 0);
	assert.deepEqual(mail.command('mail-state').messages, []);
});

test('redactLinkTokens hides every secret-bearing parameter and leaves other values readable', () => {
	assert.equal(
		redactLinkTokens('/auth/confirm?type=invite&token_hash=abc&next=%2Fauth%2Faccept-invite#access_token=def'),
		'/auth/confirm?type=invite&token_hash=[redacted]&next=%2Fauth%2Faccept-invite#access_token=[redacted]'
	);
	assert.equal(
		redactLinkTokens('/auth/renew-invite?email=a%40example.test'),
		'/auth/renew-invite?email=a%40example.test'
	);
});

const providerInput = (table, init) => [`${providerUrl}/rest/v1/${table}`, init];
function faults() {
	const passed = [];
	const control = createProviderFaultController({
		providerUrl,
		fetch: async (...args) => {
			passed.push(args);
			return new Response('real');
		}
	});
	return { control, passed };
}

test('artifact faults distinguish failed cleanup from a committed write with a lost reply', async () => {
	for (const [name, method, endpoint, committed] of [
		['document-file-remove', 'DELETE', '/storage/v1/object/personnel-documents', false],
		['document-file-remove-lost-ack', 'DELETE', '/storage/v1/object/personnel-documents', true],
		['counseling-file-remove', 'DELETE', '/storage/v1/object/counseling-files', false],
		['counseling-file-remove-lost-ack', 'DELETE', '/storage/v1/object/counseling-files', true],
		['document-attach', 'POST', '/rest/v1/personnel_documents', false],
		['counseling-attach', 'POST', '/rest/v1/counseling_records', false],
		['document-attach-lost-ack', 'POST', '/rest/v1/personnel_documents', true],
		['counseling-attach-lost-ack', 'POST', '/rest/v1/counseling_records', true]
	]) {
		const { control, passed } = faults();
		control.command('fault-arm', { name });
		for (const [url, requestMethod] of [
			[`http://127.0.0.1:56322${endpoint}`, method],
			[`${providerUrl}${endpoint}`, 'GET'],
			[`${providerUrl}${endpoint}/unrelated`, method]
		]) {
			assert.equal((await control.fetch(url, { method: requestMethod })).status, 200);
		}
		assert.equal(control.command('fault-state').controls[name].matches, 0);
		passed.length = 0;
		assert.equal((await control.fetch(`${providerUrl}${endpoint}`, { method })).status, 503);
		assert.equal(passed.length, committed ? 1 : 0);
		assert.equal(control.command('fault-state').controls[name].call.providerStatus, committed ? 200 : undefined);
		assert.equal((await control.fetch(`${providerUrl}${endpoint}`, { method })).status, 200);
	}
});

test('each named fault matches only its allowlisted writes on the owned provider', async () => {
	const cases = {
		'setup-link-create': [
			[
				providerInput('rpc/issue_account_setup_link', { method: 'POST' }),
				['POST', '/rest/v1/rpc/issue_account_setup_link']
			]
		],
		'invitation-access-link': [
			[
				providerInput('rpc/link_organization_invitation_access_request', { method: 'POST' }),
				['POST', '/rest/v1/rpc/link_organization_invitation_access_request']
			]
		],
		'invitation-block': [
			[
				providerInput('organization_invitations', { method: 'PATCH', body: JSON.stringify({ status: 'blocked' }) }),
				['PATCH', '/rest/v1/organization_invitations']
			]
		],
		'org-create': [
			[providerInput('rpc/create_organization', { method: 'POST' }), ['POST', '/rest/v1/rpc/create_organization']]
		],
		'org-setup-answer': [
			[
				providerInput('rpc/save_organization_setup_answer', { method: 'POST' }),
				['POST', '/rest/v1/rpc/save_organization_setup_answer']
			]
		],
		'org-setup-prompt': [
			[
				providerInput('rpc/save_organization_setup_prompt', { method: 'POST' }),
				['POST', '/rest/v1/rpc/save_organization_setup_prompt']
			]
		],
		'org-feature-switch': [
			[
				providerInput('organizations', {
					method: 'PATCH',
					body: JSON.stringify({ disabled_features: ['evaluations'] })
				}),
				['PATCH', '/rest/v1/organizations']
			]
		],
		'org-setup-training-editor-read': [
			[providerInput('training_types', { method: 'GET' }), ['GET', '/rest/v1/training_types', 500]]
		]
	};
	for (const [name, matching] of Object.entries(cases)) {
		for (const [input, [method, path, status = 503]] of matching) {
			const { control, passed } = faults();
			control.command('fault-arm', { name });
			const response = await control.fetch(...input);
			assert.equal(response.status, status);
			assert.equal((await response.json()).code, 'T2T_VERIFY_PROVIDER_FAULT');
			assert.equal(passed.length, 0);
			assert.deepEqual(control.command('fault-state').controls[name].call, { method, path });
		}
	}
});

test('other writes, reads, origins and foreign operations pass through without counting', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'invitation-block' });
	const ordinary = [
		providerInput('organization_invitations', { method: 'PATCH', body: JSON.stringify({ status: 'revoked' }) }),
		providerInput('organization_invitations', { method: 'PATCH', body: 'not json' }),
		providerInput('organization_invitations', { method: 'PATCH' }),
		providerInput('organization_invitations', { method: 'GET' }),
		providerInput('organization_invitations', { method: 'POST', body: JSON.stringify({ status: 'blocked' }) }),
		providerInput('account_setup_links', { method: 'POST' }),
		providerInput('rpc/issue_account_setup_link', { method: 'POST' }),
		[
			`${providerUrl.replace(':56321', ':56322')}/rest/v1/organization_invitations`,
			{ method: 'PATCH', body: '{"status":"blocked"}' }
		],
		[
			`${providerUrl.replace('http://', 'http://user:password@')}/rest/v1/organization_invitations`,
			{ method: 'PATCH', body: '{"status":"blocked"}' }
		],
		['https://example.com/rest/v1/organization_invitations', { method: 'PATCH', body: '{"status":"blocked"}' }],
		[new Request(`${providerUrl}/rest/v1/organization_invitations`, { method: 'PATCH', body: '{"status":"revoked"}' })]
	];
	for (const input of ordinary) assert.equal(await (await control.fetch(...input)).text(), 'real');
	assert.equal(passed.length, ordinary.length);
	assert.equal(control.command('fault-state').controls['invitation-block'].matches, 0);
	const blocked = new Request(`${providerUrl}/rest/v1/organization_invitations`, {
		method: 'PATCH',
		body: JSON.stringify({ status: 'blocked' })
	});
	assert.equal((await control.fetch(blocked)).status, 503);
});

test('identity faults match only the password, revocation and setup calls they name', async () => {
	const auth = (path, init) => [`${providerUrl}/auth/v1/${path}`, init];
	const cases = {
		'password-update': {
			hit: auth('user', { method: 'PUT', body: JSON.stringify({ password: 'synthetic', data: {} }) }),
			pass: [
				auth('user', { method: 'PUT', body: JSON.stringify({ email: 'next@example.test' }) }),
				auth('user', { method: 'GET' })
			]
		},
		'password-reconcile': {
			hit: providerInput('rpc/password_change_attempt', { method: 'POST', body: '{"p_action":"reconcile"}' }),
			pass: [
				providerInput('rpc/password_change_attempt', { method: 'POST', body: '{"p_action":"read"}' }),
				providerInput('rpc/password_change_attempt', { method: 'POST', body: '{"p_action":"complete"}' })
			]
		},
		'password-revocation': {
			hit: auth('logout?scope=others', { method: 'POST' }),
			pass: [
				auth('logout?scope=global', { method: 'POST' }),
				auth('logout?scope=local', { method: 'POST' }),
				auth('logout', { method: 'POST' })
			]
		},
		'setup-password': {
			hit: auth('admin/users', { method: 'POST', body: '{}' }),
			pass: [auth('admin/users/synthetic-user', { method: 'PUT', body: '{}' }), auth('admin/users', { method: 'GET' })]
		},
		'setup-reconcile': {
			hit: providerInput('rpc/reconcile_account_setup_claim', { method: 'POST' }),
			pass: [providerInput('rpc/claim_account_setup_link_for_session', { method: 'POST' })]
		},
		'setup-finalize': {
			hit: providerInput('rpc/complete_account_setup_recovery', { method: 'POST' }),
			pass: [providerInput('rpc/reconcile_account_setup_claim', { method: 'POST' })]
		}
	};
	for (const [name, { hit, pass }] of Object.entries(cases)) {
		const { control, passed } = faults();
		control.command('fault-arm', { name });
		for (const input of pass)
			assert.equal(await (await control.fetch(...input)).text(), 'real', `${name} passes ${input[0]}`);
		assert.equal((await control.fetch(...hit)).status, 503, `${name} faults its call`);
		assert.equal(passed.length, pass.length);
		assert.equal(control.command('fault-state').controls[name].matches, 1);
	}
});

test('the Ranks editor read fault fails only the training rank reference read', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'org-setup-ranks-references' });
	const references = providerInput('training_types?select=applies_to_ranks%2Cexcluded_ranks&organization_id=eq.org', {
		method: 'GET'
	});
	for (const input of [
		providerInput('training_types?select=*&organization_id=eq.org', { method: 'HEAD' }),
		providerInput('training_types?select=id%2Cname', { method: 'GET' })
	])
		assert.equal(await (await control.fetch(...input)).text(), 'real');
	assert.equal((await control.fetch(...references)).status, 500);
	assert.equal(await (await control.fetch(...references)).text(), 'real');
	assert.equal(passed.length, 3);
	assert.deepEqual(control.command('fault-state').controls['org-setup-ranks-references'].call, {
		method: 'GET',
		path: '/rest/v1/training_types'
	});
});

test('onboarding step faults fail one exact step write at the chosen ordinal and leave every sibling write alone', async () => {
	const steps = 'onboarding_template_steps';
	const insert = (table) => providerInput(table, { method: 'POST', body: JSON.stringify([{ name: 'Copied step' }]) });
	const patch = (table, order) =>
		providerInput(table, { method: 'PATCH', body: JSON.stringify({ sort_order: order }) });
	const remove = (table) => providerInput(table, { method: 'DELETE' });
	const cases = {
		'onboarding-steps-insert': {
			ordinal: 1,
			siblings: [
				insert('onboarding_templates'),
				patch(steps, 0),
				remove(steps),
				providerInput(steps, { method: 'GET' })
			],
			writes: [insert(steps), insert(steps)],
			call: { method: 'POST', path: `/rest/v1/${steps}` }
		},
		'onboarding-steps-update': {
			ordinal: 2,
			siblings: [
				patch('onboarding_templates', 0),
				patch('onboarding_step_progress', 0),
				patch('personnel_onboardings', 0),
				insert(steps),
				remove(steps)
			],
			writes: [patch(steps, 2), patch(steps, 0), patch(steps, 1)],
			call: { method: 'PATCH', path: `/rest/v1/${steps}` }
		},
		'onboarding-steps-delete': {
			ordinal: 1,
			siblings: [remove('onboarding_templates'), remove('onboarding_step_progress'), insert(steps), patch(steps, 0)],
			writes: [remove(steps), remove(steps)],
			call: { method: 'DELETE', path: `/rest/v1/${steps}` }
		}
	};
	for (const [name, { ordinal, siblings, writes, call }] of Object.entries(cases)) {
		const { control, passed } = faults();
		control.command('fault-arm', { name, ordinal });
		const foreign = [
			[`http://127.0.0.1:56322/rest/v1/${steps}`, { method: call.method }],
			[`https://example.com/rest/v1/${steps}`, { method: call.method }],
			[`${providerUrl}/rest/v1/${steps}_archive`, { method: call.method }]
		];
		for (const input of [...siblings, ...foreign])
			assert.equal(await (await control.fetch(...input)).text(), 'real', `${name} passes ${input[0]}`);
		assert.equal(control.command('fault-state').controls[name].matches, 0);
		assert.equal(passed.length, siblings.length + foreign.length);
		const outcomes = [];
		for (const write of writes) outcomes.push((await control.fetch(...write)).status);
		assert.deepEqual(
			outcomes,
			writes.map((_, index) => (index + 1 === ordinal ? 503 : 200)),
			`${name} fails only write ${ordinal}`
		);
		assert.equal(passed.length, siblings.length + foreign.length + writes.length - 1);
		assert.deepEqual(control.command('fault-state').controls[name], {
			ordinal,
			matches: ordinal,
			phase: 'faulted',
			call
		});
	}
});

test('a reorder fault is dormant for step writes issued after its ordinal, and restore clears an unfired one', async () => {
	const { control, passed } = faults();
	const reorder = (order) =>
		providerInput('onboarding_template_steps', { method: 'PATCH', body: JSON.stringify({ sort_order: order }) });
	control.command('fault-arm', { name: 'onboarding-steps-update', ordinal: 3 });
	assert.equal(await (await control.fetch(...reorder(0))).text(), 'real');
	assert.equal(await (await control.fetch(...reorder(1))).text(), 'real');
	assert.deepEqual(control.command('fault-restore').armed, []);
	assert.equal(await (await control.fetch(...reorder(2))).text(), 'real');
	const receipt = control.command('fault-state').lastControls['onboarding-steps-update'];
	assert.deepEqual(
		{ phase: receipt.phase, matches: receipt.matches, call: receipt.call },
		{
			phase: 'restored',
			matches: 2,
			call: null
		}
	);
	assert.equal(passed.length, 3);
});

test('onboarding template command faults stop or lose only their own command', async () => {
	const commands = {
		duplicate: 'rpc/duplicate_onboarding_template',
		reorder: 'rpc/reorder_onboarding_template_steps',
		delete: 'rpc/delete_onboarding_template'
	};
	const unrelated = [
		providerInput('rpc/start_onboarding_packet', { method: 'POST' }),
		providerInput('rpc/duplicate_onboarding_templates', { method: 'POST' }),
		providerInput('onboarding_template_steps', { method: 'POST' }),
		providerInput('onboarding_templates', { method: 'DELETE' })
	];
	for (const [command, rpc] of Object.entries(commands)) {
		const siblings = Object.values(commands).filter((other) => other !== rpc);
		for (const afterCommit of [false, true]) {
			const name = `onboarding-template-${command}${afterCommit ? '-lost-ack' : ''}`;
			const { control, passed } = faults();
			control.command('fault-arm', { name });
			const others = [...unrelated, ...siblings.map((other) => providerInput(other, { method: 'POST' }))];
			for (const input of others) assert.equal(await (await control.fetch(...input)).text(), 'real', `${name} passes`);
			const call = providerInput(rpc, { method: 'POST', body: '{"p_organization_id":"org"}' });
			const response = await control.fetch(...call);
			assert.equal(response.status, 503);
			assert.equal((await response.json()).code, 'T2T_VERIFY_PROVIDER_FAULT');
			assert.equal(passed.length, others.length + (afterCommit ? 1 : 0), `${name} commits only when the reply is lost`);
			assert.deepEqual(control.command('fault-state').controls[name].call, {
				method: 'POST',
				path: `/rest/v1/${rpc}`,
				...(afterCommit ? { providerStatus: 200 } : {})
			});
			assert.equal(await (await control.fetch(...call)).text(), 'real', `${name} fires once`);
		}
	}
});

test('a lost-acknowledgment fault lets the provider commit, then replaces its reply with a 503', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'org-create-lost-ack' });
	const create = providerInput('rpc/create_organization', { method: 'POST', body: '{"p_name":"Unit"}' });
	const response = await control.fetch(...create);
	assert.equal(response.status, 503);
	assert.equal((await response.json()).code, 'T2T_VERIFY_PROVIDER_FAULT');
	assert.deepEqual(passed, [create]);
	assert.deepEqual(control.command('fault-state').controls['org-create-lost-ack'].call, {
		method: 'POST',
		path: '/rest/v1/rpc/create_organization',
		providerStatus: 200
	});
	assert.equal(await (await control.fetch(...create)).text(), 'real');
});

test('a lost-acknowledgment fault returns a failed provider reply unchanged', async () => {
	const control = createProviderFaultController({
		providerUrl,
		fetch: async () => new Response('{"message":"provider rejected"}', { status: 409 })
	});
	control.command('fault-arm', { name: 'setup-finalize-lost-ack' });
	const response = await control.fetch(...providerInput('rpc/complete_account_setup_recovery', { method: 'POST' }));
	assert.equal(response.status, 409);
	assert.equal(await response.text(), '{"message":"provider rejected"}');
	const receipt = control.command('fault-state').controls['setup-finalize-lost-ack'];
	assert.equal(receipt.phase, 'provider-failed');
	assert.equal(receipt.call.providerStatus, 409);
});

test('a pre-commit org-create fault never reaches the provider; other writes pass', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'org-create' });
	for (const table of ['groups', 'organization_memberships', 'rpc/create_organizations'])
		assert.equal(await (await control.fetch(...providerInput(table, { method: 'POST' }))).text(), 'real');
	assert.equal(passed.length, 3);
	assert.equal((await control.fetch(...providerInput('rpc/create_organization', { method: 'POST' }))).status, 503);
	assert.equal(passed.length, 3);
});

test('a fault fires on the selected ordinal once and stays dormant until restored and re-armed', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'setup-link-create', ordinal: 2 });
	assert.throws(() => control.command('fault-arm', { name: 'setup-link-create' }));
	const create = providerInput('rpc/issue_account_setup_link', { method: 'POST' });
	assert.equal(await (await control.fetch(...create)).text(), 'real');
	assert.equal((await control.fetch(...create)).status, 503);
	assert.equal(await (await control.fetch(...create)).text(), 'real');
	assert.equal(passed.length, 2);
	const state = control.command('fault-state');
	assert.deepEqual(state.armed, []);
	assert.deepEqual(state.controls['setup-link-create'], {
		ordinal: 2,
		matches: 2,
		phase: 'faulted',
		call: { method: 'POST', path: '/rest/v1/rpc/issue_account_setup_link' }
	});
	control.command('fault-restore');
	assert.deepEqual(control.command('fault-state').controls, {});
	assert.equal(control.command('fault-state').lastControls['setup-link-create'].phase, 'faulted');
	control.command('fault-arm', { name: 'setup-link-create' });
	assert.equal((await control.fetch(...create)).status, 503);
});

test('restore before the ordinal leaves later writes untouched; invalid arming is refused', async () => {
	const { control } = faults();
	for (const options of [
		{ name: 'account-setup' },
		{ name: 'setup-link-create', ordinal: 0 },
		{ name: 'setup-link-create', ordinal: 11 },
		{ name: 'setup-link-create', ordinal: 1.5 },
		{ name: 'constructor' }
	])
		assert.throws(() => control.command('fault-arm', options));
	control.command('fault-arm', { name: 'setup-link-create', ordinal: 2 });
	const create = providerInput('rpc/issue_account_setup_link', { method: 'POST' });
	assert.equal(await (await control.fetch(...create)).text(), 'real');
	assert.deepEqual(control.command('fault-restore').armed, []);
	assert.equal(await (await control.fetch(...create)).text(), 'real');
	assert.equal(control.command('fault-state').lastControls['setup-link-create'].phase, 'restored');
	assert.throws(
		() => createProviderFaultController({ providerUrl: 'http://localhost:56321', fetch }),
		/exact owned loopback provider origin/
	);
});

test('the actual Node preloader captures mail, serves its link only over the authenticated endpoint and faults one write', async (t) => {
	const session = await fs.mkdtemp(path.join(os.tmpdir(), 't2t-outbound-control-test-'));
	await fs.chmod(session, 0o700);
	const requests = [];
	const provider = createServer((request, response) => {
		requests.push(`${request.method} ${request.url}`);
		if (request.url === '/storage/v1/object/counseling-files') {
			response.setHeader('Content-Type', 'application/json');
			response.end('[{"name":"owned/sign-in-rosters/fixture/scan.pdf"}]');
		} else response.end('actual fixture write');
	});
	await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
	const config = {
		sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		token: 'd'.repeat(64),
		mailApiKey: apiKey,
		providerUrl: `http://127.0.0.1:${provider.address().port}`,
		orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
	};
	const configFile = path.join(session, 'control.json');
	await fs.writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
	const preload = new URL('./server-source-control.mjs', import.meta.url);
	preload.searchParams.set('config', configFile);
	const child = spawn(
		process.execPath,
		[
			'--import',
			preload.href,
			'--input-type=module',
			'-e',
			`import { createInterface } from 'node:readline';
			import { createClient } from ${JSON.stringify(new URL('../../node_modules/@supabase/supabase-js/dist/index.mjs', import.meta.url).href)};
			const lines = createInterface({ input: process.stdin });
			process.stdout.write('ready\\n');
			for await (const line of lines) {
				const { url, init } = JSON.parse(line);
				if (init?.adminStorage) {
					const admin = createClient(url, 'owned-synthetic-service-key', { auth: { persistSession: false, autoRefreshToken: false } });
					const { data, error } = await admin.storage.from('counseling-files').remove(['owned/sign-in-rosters/fixture/scan.pdf']);
					process.stdout.write(JSON.stringify({ data, error: error && { status: error.statusCode, message: error.message } }) + '\\n');
					continue;
				}
				if (init?.rpc) {
					const client = createClient(url, 'owned-synthetic-service-key', { auth: { persistSession: false, autoRefreshToken: false } });
					const { error } = await client.rpc(init.rpc, {});
					process.stdout.write(JSON.stringify({ error: error && { code: error.code, message: error.message } }) + '\\n');
					continue;
				}
				const response = await fetch(url, init);
				process.stdout.write(JSON.stringify({ status: response.status, body: await response.text() }) + '\\n');
			}`
		],
		{ stdio: ['pipe', 'pipe', 'pipe'] }
	);
	let output = '';
	let diagnostic = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (diagnostic += chunk));
	t.after(async () => {
		if (child.exitCode === null) {
			const exited = once(child, 'exit');
			child.kill('SIGKILL');
			await exited;
		}
		await new Promise((resolve) => provider.close(resolve));
		await fs.rm(session, { recursive: true, force: true });
	});
	async function waitFor(predicate) {
		for (let attempt = 0; attempt < 200; attempt++) {
			if (predicate()) return;
			assert.equal(child.exitCode, null, diagnostic);
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		assert.fail(`Preloader did not reach its expected state: ${diagnostic}`);
	}
	await waitFor(() => output.includes('ready\n'));
	const ready = JSON.parse(await fs.readFile(path.join(session, 'server-source-control-ready.json'), 'utf8'));
	const endpoint = `http://127.0.0.1:${ready.port}`;
	async function command(action, options = {}, token = config.token) {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: JSON.stringify({ action, ...options })
		});
		return response.status === 403 ? { status: 403 } : response.json();
	}
	let seen = 0;
	async function send(url, init) {
		const results = () => output.split('\n').filter((line) => line.startsWith('{'));
		const expected = ++seen;
		child.stdin.write(`${JSON.stringify({ url, init })}\n`);
		await waitFor(() => results().length === expected);
		return JSON.parse(results().at(-1));
	}
	const [url, init] = setupMail();
	assert.equal((await command('mail-state', {}, 'e'.repeat(64))).status, 403);
	assert.equal((await send(url, init)).status, 200);
	const state = await command('mail-state');
	assert.equal(state.messages[0].kind, 'account-setup');
	assert.equal(JSON.stringify(state).includes(rawToken), false);
	assert.equal((await command('mail-link', { email: 'new@example.test', kind: 'account-setup' })).link, setupUrl);
	await command('mail-arm', { mode: 'fail' });
	assert.equal((await send(url, init)).status, 503);
	assert.equal((await send(url, init)).status, 200);
	assert.equal(requests.length, 0);

	const write = `${config.providerUrl}/rest/v1/rpc/issue_account_setup_link`;
	await command('fault-arm', { name: 'setup-link-create' });
	assert.equal((await send(write, { method: 'POST', body: '{}' })).status, 503);
	assert.equal((await send(write, { method: 'POST', body: '{}' })).body, 'actual fixture write');
	assert.deepEqual(requests, ['POST /rest/v1/rpc/issue_account_setup_link']);
	assert.equal((await command('fault-state')).controls['setup-link-create'].phase, 'faulted');
	await command('fault-arm', { name: 'counseling-file-remove' });
	const denied = await send(config.providerUrl, { adminStorage: true });
	assert.equal(denied.error.status, 'T2T_VERIFY_PROVIDER_FAULT');
	assert.equal(requests.length, 1);
	assert.deepEqual((await command('fault-state')).controls['counseling-file-remove'].call, {
		method: 'DELETE',
		path: '/storage/v1/object/counseling-files'
	});
	const admitted = await send(config.providerUrl, { adminStorage: true });
	assert.deepEqual(admitted, { data: [{ name: 'owned/sign-in-rosters/fixture/scan.pdf' }], error: null });
	assert.deepEqual(requests, [
		'POST /rest/v1/rpc/issue_account_setup_link',
		'DELETE /storage/v1/object/counseling-files'
	]);
	for (const name of ['roster-scan-attach-lost-ack', 'roster-delete-lost-ack']) {
		const rpc = name === 'roster-delete-lost-ack' ? 'delete_sign_in_roster' : 'attach_sign_in_roster_scan';
		await command('fault-arm', { name });
		const lost = await send(config.providerUrl, { rpc });
		assert.equal(lost.error.code, '', 'the installed SDK reports a transport loss without a database code');
		assert.equal(requests.at(-1), `POST /rest/v1/rpc/${rpc}`);
		assert.deepEqual((await command('fault-state')).controls[name].call, {
			method: 'POST',
			path: `/rest/v1/rpc/${rpc}`,
			providerStatus: 200
		});
		await command('fault-restore');
	}
	const heldName = 'roster-scan-attach-committed-hold';
	await command('fault-arm', { name: heldName });
	const requestsBefore = requests.length;
	child.stdin.write(`${JSON.stringify({ url: config.providerUrl, init: { rpc: 'attach_sign_in_roster_scan' } })}\n`);
	for (
		let attempt = 0;
		attempt < 200 && (await command('fault-state')).controls[heldName]?.phase !== 'committed-held';
		attempt++
	)
		await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal((await command('fault-state')).controls[heldName].phase, 'committed-held');
	assert.equal(requests.length, requestsBefore + 1);
	assert.equal((await command('fault-release', { name: 'roster-delete-hold' })).status, 'BLOCKED');
	assert.equal((await command('fault-release', { name: heldName })).status, 'PASS');
	await waitFor(() => output.split('\n').filter((line) => line.startsWith('{')).length === seen + 1);
	assert.equal(
		JSON.parse(
			output
				.split('\n')
				.filter((line) => line.startsWith('{'))
				.at(-1)
		).error.code,
		''
	);
	assert.equal((await command('fault-state')).controls[heldName].call.releaseReason, 'released');
	await command('fault-restore');
	assert.equal(diagnostic, '');
	assert.equal(JSON.stringify(ready).includes(config.token), false);
	assert.equal(JSON.stringify(ready).includes(apiKey), false);
});

test('roster command holds forward real results only after release and restore releases pending writes', async () => {
	for (const [name, command] of [
		['roster-scan-attach-hold', 'attach_sign_in_roster_scan'],
		['roster-scan-remove-hold', 'remove_sign_in_roster_scan'],
		['roster-delete-hold', 'delete_sign_in_roster']
	]) {
		const path = `/rest/v1/rpc/${command}`;
		const passed = [];
		const controller = createProviderFaultController({
			providerUrl,
			fetch: async (input, init) => {
				passed.push({ url: String(input), method: init.method });
				return new Response('committed', { status: 200 });
			}
		});
		controller.command('fault-arm', { name });
		const pending = controller.fetch(`${providerUrl}${path}`, { method: 'POST', body: '{}' });
		while (controller.command('fault-state').controls[name].phase !== 'held') await new Promise(setImmediate);
		assert.equal(passed.length, 0);
		assert.equal(
			await (
				await controller.fetch(`${providerUrl}/rest/v1/rpc/settle_sign_in_roster_scan_upload`, { method: 'POST' })
			).text(),
			'committed'
		);
		controller.command('fault-release', { name });
		assert.equal(await (await pending).text(), 'committed');
		assert.deepEqual(controller.command('fault-state').controls[name].call, {
			method: 'POST',
			path,
			releaseReason: 'released',
			providerStatus: 200
		});
		controller.command('fault-arm', { name });
		const restored = controller.fetch(`${providerUrl}${path}`, { method: 'POST', body: '{}' });
		while (controller.command('fault-state').controls[name].phase !== 'held') await new Promise(setImmediate);
		controller.command('fault-restore');
		assert.equal(await (await restored).text(), 'committed');
		assert.equal(passed.length, 3);
	}
});

test('auth confirmation mail is its own kind and its token hash is redacted', async () => {
	const { mail } = sink();
	const confirm = `http://127.0.0.1:4100/auth/confirm?token_hash=${rawToken}&type=recovery`;
	await mail.fetch(...mailRequest({ subject: 'Reset your password', text: `Reset here: ${confirm}\n` }));
	const [message] = mail.command('mail-state').messages;
	assert.equal(message.kind, 'auth');
	assert.deepEqual(message.paths, ['/auth/confirm?token_hash=[redacted]&type=recovery']);
	assert.equal(mail.command('mail-link', { email: 'new@example.test', kind: 'auth' }).link, confirm);
});

test('issuance and cleanup faults compose: each fails its own write once', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'setup-link-create' });
	control.command('fault-arm', { name: 'invitation-block' });
	assert.deepEqual(control.command('fault-state').armed, ['setup-link-create', 'invitation-block']);
	const block = providerInput('organization_invitations', {
		method: 'PATCH',
		body: JSON.stringify({ status: 'blocked' })
	});
	assert.equal((await control.fetch(...providerInput('rpc/issue_account_setup_link', { method: 'POST' }))).status, 503);
	assert.equal((await control.fetch(...block)).status, 503);
	assert.equal(await (await control.fetch(...block)).text(), 'real');
	assert.equal(passed.length, 1);
	assert.deepEqual(
		Object.fromEntries(Object.entries(control.command('fault-state').controls).map(([name, { call }]) => [name, call])),
		{
			'setup-link-create': { method: 'POST', path: '/rest/v1/rpc/issue_account_setup_link' },
			'invitation-block': { method: 'PATCH', path: '/rest/v1/organization_invitations' }
		}
	);
});

test('opening a captured link never surfaces its token, even when DevTools fails', async () => {
	const origin = 'http://127.0.0.1:4100';
	const captured = { sequence: 3, link: `${origin}/auth/setup-account?token=${rawToken}` };
	const textContent = (result) => result;
	const failing = (failOn) => async (name, args) => {
		if (name === failOn) throw new Error(`navigate failed for ${args.url ?? captured.link}`);
		return name === 'take_snapshot' ? 'Choose your password' : null;
	};
	for (const failOn of ['navigate_page', 'take_snapshot']) {
		const error = await openCapturedLink({ captured, origin, pageId: 2, call: failing(failOn), textContent }).catch(
			(caught) => caught
		);
		assert.equal(error.message.includes(rawToken), false);
		assert.match(error.message, /withheld/);
	}
	await assert.rejects(
		openCapturedLink({ captured, origin: 'http://127.0.0.1:9999', pageId: 2, call: failing(), textContent }),
		/not on the owned app origin/
	);
	const leaky = async (name) => (name === 'take_snapshot' ? `url=${captured.link.replace('token=', 'TOKEN=')}` : null);
	await assert.rejects(
		openCapturedLink({
			captured,
			origin,
			pageId: 2,
			call: leaky,
			textContent: (result) => result.replace('TOKEN=', 'x=')
		}),
		/refusing to print/
	);
	assert.deepEqual(await openCapturedLink({ captured, origin, pageId: 2, call: failing(), textContent }), {
		sequence: 3,
		path: '/auth/setup-account',
		snapshot: 'Choose your password'
	});
});

test('Critical Tasks lost replies commit only the selected owned table write and preserve provider refusals', async () => {
	for (const [name, method, table] of [
		['ict-tasks-insert-lost-ack', 'POST', 'ict_tasks'],
		['ict-tasks-update-lost-ack', 'PATCH', 'ict_tasks'],
		['ict-tasks-reorder-lost-ack', 'POST', 'rpc/reorder_ict_tasks'],
		['ict-completions-insert-lost-ack', 'POST', 'personnel_ict_completions'],
		['ict-completions-update-lost-ack', 'PATCH', 'personnel_ict_completions']
	]) {
		const passed = [];
		const control = createProviderFaultController({
			providerUrl,
			fetch: async (input, init) => {
				passed.push({ url: String(input), method: init.method, body: init.body });
				return new Response('[{"id":"saved-task","title":"committed"}]', { status: 201 });
			}
		});
		control.command('fault-arm', { name, ordinal: 2 });
		for (const [url, otherMethod] of [
			[`${providerUrl}/rest/v1/${table}`, 'GET'],
			[`${providerUrl}/rest/v1/${table}`, 'DELETE'],
			[`${providerUrl}/rest/v1/${table}`, method === 'POST' ? 'PATCH' : 'POST'],
			[`${providerUrl}/rest/v1/${table === 'ict_tasks' ? 'personnel_ict_completions' : 'ict_tasks'}`, method],
			[`${providerUrl}/rest/v1/${table}_other`, method],
			[`http://127.0.0.1:56322/rest/v1/${table}`, method]
		]) {
			assert.deepEqual(await (await control.fetch(url, { method: otherMethod })).json(), [
				{ id: 'saved-task', title: 'committed' }
			]);
		}
		assert.equal(control.command('fault-state').controls[name].matches, 0);
		const request = providerInput(`${table}?organization_id=eq.owned`, { method, body: '{"title":"committed"}' });
		assert.equal((await control.fetch(...request)).status, 201);
		await assert.rejects(control.fetch(...request), (error) => {
			assert.equal(error instanceof TypeError, true);
			assert.equal(error.message, 'fetch failed');
			assert.equal(error.cause.code, 'UND_ERR_SOCKET');
			return true;
		});
		assert.deepEqual(passed.slice(-2), [
			{ url: request[0], method, body: '{"title":"committed"}' },
			{ url: request[0], method, body: '{"title":"committed"}' }
		]);
		assert.deepEqual(control.command('fault-state').controls[name], {
			ordinal: 2,
			matches: 2,
			phase: 'faulted',
			call: { method, path: `/rest/v1/${table}`, providerStatus: 201 }
		});
		assert.equal((await control.fetch(...request)).status, 201);
		assert.deepEqual(control.command('fault-restore').armed, []);
		control.command('fault-arm', { name });
		control.command('fault-restore');
		assert.equal((await control.fetch(...request)).status, 201);

		const failed = createProviderFaultController({
			providerUrl,
			fetch: async () => new Response('{"code":"23505"}', { status: 409 })
		});
		failed.command('fault-arm', { name });
		const refusal = await failed.fetch(...request);
		assert.equal(refusal.status, 409);
		assert.deepEqual(await refusal.json(), { code: '23505' });
		assert.equal(failed.command('fault-state').controls[name].phase, 'provider-failed');
	}
});

test('roster command faults preserve unrelated writes and distinguish commit, transport loss and rejection', async () => {
	for (const [name, command, committed] of [
		['roster-scan-attach', 'attach_sign_in_roster_scan', false],
		['roster-scan-attach-lost-ack', 'attach_sign_in_roster_scan', true],
		['roster-scan-remove', 'remove_sign_in_roster_scan', false],
		['roster-scan-remove-lost-ack', 'remove_sign_in_roster_scan', true],
		['roster-scan-settle', 'settle_sign_in_roster_scan_upload', false],
		['roster-delete', 'delete_sign_in_roster', false],
		['roster-delete-lost-ack', 'delete_sign_in_roster', true]
	]) {
		const writes = [];
		const control = createProviderFaultController({
			providerUrl,
			fetch: async (input, init) => {
				writes.push({ url: String(input), method: init?.method, body: init?.body });
				return new Response('provider acknowledged', { status: 200 });
			}
		});
		control.command('fault-arm', { name });
		for (const [url, init] of [
			[`${providerUrl}/rest/v1/sign_in_rosters`, { method: 'PATCH', body: '{"title":"kept"}' }],
			[`${providerUrl}/rest/v1/sign_in_rosters`, { method: 'DELETE' }],
			[`${providerUrl}/rest/v1/rpc/${command}_archive`, { method: 'POST', body: '{}' }],
			[`http://127.0.0.1:56322/rest/v1/rpc/${command}`, { method: 'POST', body: '{}' }]
		])
			assert.equal(await (await control.fetch(url, init)).text(), 'provider acknowledged');
		const before = writes.length;
		const input = providerInput(`rpc/${command}`, { method: 'POST', body: '{}' });
		if (name.endsWith('-lost-ack'))
			await assert.rejects(control.fetch(...input), (error) => {
				assert.equal(error instanceof TypeError, true);
				assert.equal(error.message, 'fetch failed');
				assert.equal(error.cause.code, 'UND_ERR_SOCKET');
				return true;
			});
		else assert.equal((await control.fetch(...input)).status, 503);
		assert.equal(writes.length, before + Number(committed));
		assert.deepEqual(control.command('fault-state').controls[name].call, {
			method: 'POST',
			path: `/rest/v1/rpc/${command}`,
			...(committed ? { providerStatus: 200 } : {})
		});
		assert.equal(await (await control.fetch(...input)).text(), 'provider acknowledged');
	}
});

test('roster lost replies throw a transport loss only after a successful upstream reply, and stay visible when it fails', async () => {
	for (const [name, command] of [
		['roster-scan-attach-lost-ack', 'attach_sign_in_roster_scan'],
		['roster-scan-remove-lost-ack', 'remove_sign_in_roster_scan'],
		['roster-delete-lost-ack', 'delete_sign_in_roster']
	]) {
		const failed = createProviderFaultController({
			providerUrl,
			fetch: async () => new Response('{"code":"40P01"}', { status: 409 })
		});
		failed.command('fault-arm', { name });
		const response = await failed.fetch(...providerInput(`rpc/${command}`, { method: 'POST', body: '{}' }));
		assert.equal(response.status, 409);
		assert.equal(await response.text(), '{"code":"40P01"}');
		assert.deepEqual(failed.command('fault-state').controls[name], {
			ordinal: 1,
			matches: 1,
			phase: 'provider-failed',
			call: { method: 'POST', path: `/rest/v1/rpc/${command}`, providerStatus: 409 }
		});
	}
});

test('the committed attach pause exposes a committed receipt, admits later requests and loses its reply only on release', async () => {
	const name = 'roster-scan-attach-committed-hold';
	const path = '/rest/v1/rpc/attach_sign_in_roster_scan';
	const passed = [];
	const control = createProviderFaultController({
		providerUrl,
		fetch: async (input, init) => {
			passed.push({ url: String(input), method: init?.method });
			return new Response('[]', { status: 200 });
		}
	});
	assert.throws(() => control.command('fault-release', { name }), /currently held/);
	control.command('fault-arm', { name });
	const request = providerInput('rpc/attach_sign_in_roster_scan', { method: 'POST', body: '{}' });
	const first = control.fetch(...request).then(
		() => assert.fail('The paused reply must be lost'),
		(error) => error
	);
	while (control.command('fault-state').controls[name].phase !== 'committed-held') await new Promise(setImmediate);
	assert.equal(passed.length, 1);
	assert.deepEqual(control.command('fault-state').controls[name].call, {
		method: 'POST',
		path,
		providerStatus: 200
	});
	assert.deepEqual(control.command('fault-state').armed, []);
	assert.equal((await control.fetch(...request)).status, 200);
	assert.equal(
		await (await control.fetch(...providerInput('rpc/delete_sign_in_roster', { method: 'POST', body: '{}' }))).text(),
		'[]'
	);
	assert.equal(passed.length, 3);
	assert.equal(control.command('fault-state').controls[name].phase, 'committed-held');
	control.command('fault-release', { name });
	const lost = await first;
	assert.equal(lost instanceof TypeError && lost.message === 'fetch failed', true);
	assert.deepEqual(control.command('fault-state').controls[name], {
		ordinal: 1,
		matches: 1,
		phase: 'faulted',
		call: { method: 'POST', path, providerStatus: 200, releaseReason: 'released' }
	});
	assert.throws(() => control.command('fault-release', { name }), /currently held/);
	assert.equal((await control.fetch(...request)).status, 200);
	assert.equal(passed.length, 4);
});

test('the committed attach pause is finite and restore releases it with a transport loss', async () => {
	const name = 'roster-scan-attach-committed-hold';
	for (const ending of ['deadline', 'restored']) {
		mock.timers.enable({ apis: ['setTimeout'] });
		try {
			const control = createProviderFaultController({
				providerUrl,
				fetch: async () => new Response('[]', { status: 200 })
			});
			control.command('fault-arm', { name });
			const pending = control
				.fetch(...providerInput('rpc/attach_sign_in_roster_scan', { method: 'POST', body: '{}' }))
				.then(
					() => assert.fail('The paused reply must be lost'),
					(error) => error
				);
			while (control.command('fault-state').controls[name].phase !== 'committed-held') await new Promise(setImmediate);
			mock.timers.tick(119_999);
			assert.equal(control.command('fault-state').controls[name].phase, 'committed-held');
			if (ending === 'deadline') mock.timers.tick(1);
			else control.command('fault-restore');
			assert.equal((await pending) instanceof TypeError, true);
			const receipt =
				ending === 'deadline'
					? control.command('fault-state').controls[name]
					: control.command('fault-state').lastControls[name];
			assert.deepEqual(receipt.call, {
				method: 'POST',
				path: '/rest/v1/rpc/attach_sign_in_roster_scan',
				providerStatus: 200,
				releaseReason: ending
			});
			assert.equal(receipt.phase, 'faulted');
		} finally {
			mock.timers.reset();
		}
	}
});

test('the pre-dispatch attach pause holds before the provider, admits other requests and dispatches only on release', async () => {
	const name = 'roster-scan-attach-predispatch-pause';
	const path = '/rest/v1/rpc/attach_sign_in_roster_scan';
	const passed = [];
	const control = createProviderFaultController({
		providerUrl,
		fetch: async (input) => {
			passed.push(new URL(String(input)).pathname);
			return new Response('{"code":"P0002"}', { status: 404 });
		}
	});
	control.command('fault-arm', { name });
	const request = providerInput('rpc/attach_sign_in_roster_scan', { method: 'POST', body: '{}' });
	const held = control.fetch(...request);
	while (control.command('fault-state').controls[name].phase !== 'held') await new Promise(setImmediate);
	assert.deepEqual(control.command('fault-state').controls[name].call, { method: 'POST', path });
	assert.deepEqual(passed, []);
	await control.fetch(...request);
	await control.fetch(...providerInput('rpc/delete_sign_in_roster', { method: 'POST', body: '{}' }));
	await control.fetch('http://127.0.0.1:56322/rest/v1/rpc/attach_sign_in_roster_scan', { method: 'POST' });
	assert.deepEqual(passed, [path, '/rest/v1/rpc/delete_sign_in_roster', path]);
	assert.equal(control.command('fault-state').controls[name].phase, 'held');
	control.command('fault-release', { name });
	assert.equal((await held).status, 404);
	assert.deepEqual(passed, [path, '/rest/v1/rpc/delete_sign_in_roster', path, path]);
	assert.deepEqual(control.command('fault-state').controls[name], {
		ordinal: 1,
		matches: 1,
		phase: 'dispatched',
		call: { method: 'POST', path, releaseReason: 'released', providerStatus: 404 }
	});
	assert.throws(() => control.command('fault-release', { name }), /currently held/);
});

test('the pre-dispatch pause lasts 120 seconds while the scripted hold keeps its 4-second deadline', async () => {
	for (const [name, deadline, ending] of [
		['roster-scan-attach-predispatch-pause', 120_000, 'deadline'],
		['roster-scan-attach-predispatch-pause', 120_000, 'restored'],
		['roster-scan-attach-hold', 4_000, 'deadline']
	]) {
		mock.timers.enable({ apis: ['setTimeout'] });
		try {
			let dispatched = 0;
			const control = createProviderFaultController({
				providerUrl,
				fetch: async () => {
					dispatched++;
					return new Response('[]', { status: 200 });
				}
			});
			control.command('fault-arm', { name });
			const pending = control.fetch(...providerInput('rpc/attach_sign_in_roster_scan', { method: 'POST', body: '{}' }));
			while (control.command('fault-state').controls[name].phase !== 'held') await new Promise(setImmediate);
			mock.timers.tick(deadline - 1);
			assert.equal(control.command('fault-state').controls[name].phase, 'held');
			assert.equal(dispatched, 0);
			if (ending === 'deadline') mock.timers.tick(1);
			else control.command('fault-restore');
			assert.equal((await pending).status, 200);
			const receipt =
				ending === 'deadline'
					? control.command('fault-state').controls[name]
					: control.command('fault-state').lastControls[name];
			assert.deepEqual(receipt.call, {
				method: 'POST',
				path: '/rest/v1/rpc/attach_sign_in_roster_scan',
				releaseReason: ending,
				...(ending === 'deadline' ? { providerStatus: 200 } : {})
			});
			assert.equal(dispatched, 1);
		} finally {
			mock.timers.reset();
		}
	}
});

test('other owners keep a synthetic 503 for a lost reply instead of a transport exception', async () => {
	for (const [name, path] of [
		['document-file-remove-lost-ack', '/storage/v1/object/personnel-documents'],
		['counseling-file-remove-lost-ack', '/storage/v1/object/counseling-files'],
		['org-create-lost-ack', '/rest/v1/rpc/create_organization']
	]) {
		const control = createProviderFaultController({ providerUrl, fetch: async () => new Response('[]') });
		control.command('fault-arm', { name });
		const response = await control.fetch(`${providerUrl}${path}`, {
			method: path.startsWith('/storage') ? 'DELETE' : 'POST'
		});
		assert.equal(response.status, 503);
		assert.equal((await response.json()).code, 'T2T_VERIFY_PROVIDER_FAULT');
	}
});

test('Calendar command faults select only their command and distinguish rejection from a lost reply', async () => {
	for (const [command, rejected, lost] of [
		['reset_federal_holidays', 'federal-holiday-reset', 'federal-holiday-reset-lost-ack'],
		['add_closure_days', 'closure-days', 'closure-days-lost-ack'],
		['set_calendar_lanes', 'calendar-lanes', 'calendar-lanes-lost-ack'],
		['set_status_type_order', 'status-order', 'status-order-lost-ack']
	]) {
		const pass = [
			providerInput('special_days', { method: 'POST', body: '[{"type":"federal-holiday"}]' }),
			providerInput('assignment_types?id=eq.x', { method: 'PATCH', body: '{"show_on_calendar":true}' }),
			providerInput(`rpc/${command}_archive`, { method: 'POST', body: '{}' }),
			[`http://127.0.0.1:56322/rest/v1/rpc/${command}`, { method: 'POST', body: '{}' }]
		];
		const hit = providerInput(`rpc/${command}`, { method: 'POST', body: '{"p_organization_id":"a"}' });
		for (const name of [rejected, lost]) {
			const { control, passed } = faults();
			control.command('fault-arm', { name });
			for (const input of pass) assert.equal(await (await control.fetch(...input)).text(), 'real', `${name} passes`);
			assert.equal(control.command('fault-state').controls[name].matches, 0);
			if (name === lost) {
				await assert.rejects(
					control.fetch(...hit),
					(error) => error instanceof TypeError && error.message === 'fetch failed'
				);
				assert.equal(passed.length, pass.length + 1, `${name} commits before losing the reply`);
			} else {
				assert.equal((await control.fetch(...hit)).status, 503);
				assert.equal(passed.length, pass.length, `${name} never reaches the provider`);
			}
			assert.equal(await (await control.fetch(...hit)).text(), 'real', `${name} fires once`);
		}
	}
});

test('Calendar command holds dispatch the held command only after release', async () => {
	for (const [name, command] of [
		['federal-holiday-reset-hold', 'reset_federal_holidays'],
		['closure-days-hold', 'add_closure_days'],
		['calendar-lanes-hold', 'set_calendar_lanes'],
		['status-order-hold', 'set_status_type_order']
	]) {
		const input = providerInput(`rpc/${command}`, { method: 'POST', body: '{"held":true}' });
		const order = [];
		const control = createProviderFaultController({
			providerUrl,
			fetch: async (_url, init) => {
				order.push(init.body);
				return new Response('[]', { status: 200 });
			}
		});
		control.command('fault-arm', { name });
		const held = control.fetch(...input);
		while (control.command('fault-state').controls[name].phase !== 'held') await new Promise(setImmediate);
		const later = providerInput('assignment_types', { method: 'GET' });
		assert.equal((await control.fetch(...later)).status, 200);
		assert.deepEqual(order, [undefined]);
		control.command('fault-release', { name });
		assert.equal((await held).status, 200);
		assert.deepEqual(order, [undefined, '{"held":true}']);
		assert.equal(control.command('fault-state').controls[name].phase, 'dispatched');
	}
});
