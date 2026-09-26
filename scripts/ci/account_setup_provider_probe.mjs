import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.T2T_PROBE_API_URL;
const serviceKey = process.env.T2T_PROBE_SERVICE_KEY;
const anonKey = process.env.T2T_PROBE_ANON_KEY;
assert.ok(url && serviceKey && anonKey, 'Disposable provider coordinates are required');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

function dataOrThrow(result, step) {
	if (result.error) throw new Error(`${step} failed (${result.error.code ?? 'unknown'})`);
	return result.data;
}

async function claimedAttempt(email, label) {
	const requestId = randomUUID();
	const linkId = randomUUID();
	dataOrThrow(
		await service.from('access_requests').insert({
			id: requestId,
			email,
			name: label,
			status: 'approved'
		}),
		`${label} request`
	);
	dataOrThrow(
		await service.from('account_setup_links').insert({
			id: linkId,
			access_request_id: requestId,
			token_hash: `probe-${linkId}`,
			expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
		}),
		`${label} link`
	);
	const claim = dataOrThrow(
		await service.rpc('claim_account_setup_link_for_session', {
			p_setup_link_id: linkId,
			p_access_request_id: requestId,
			p_claimed_at: new Date().toISOString()
		}),
		`${label} claim`
	);
	assert.equal(claim[0]?.claim_status, 'claim-started', `${label} claim admission`);
	const attempt = dataOrThrow(
		await service.from('account_setup_attempts').select('id,state,auth_user_id').eq('setup_link_id', linkId).single(),
		`${label} attempt`
	);
	assert.equal(attempt.state, 'started');
	return { requestId, linkId, marker: attempt.id };
}

async function assertAttempt(linkId, state, userId = null) {
	const attempt = dataOrThrow(
		await service.from('account_setup_attempts').select('state,auth_user_id').eq('setup_link_id', linkId).single(),
		'attempt read'
	);
	assert.equal(attempt.state, state);
	assert.equal(attempt.auth_user_id, userId);
}

async function assertPassword(email, password, works) {
	const result = await publicClient.auth.signInWithPassword({ email, password });
	assert.equal(result.error === null, works, `password outcome for ${email}`);
	if (!result.error) await publicClient.auth.signOut();
}

const createdEmail = `probe-create-${randomUUID()}@example.test`;
const updatedEmail = `probe-update-${randomUUID()}@example.test`;
const lateCreateEmail = `probe-late-create-${randomUUID()}@example.test`;
const lateUpdateEmail = `probe-late-update-${randomUUID()}@example.test`;

const created = await claimedAttempt(createdEmail, 'provider create');
const newUser = dataOrThrow(
	await service.auth.admin.createUser({
		email: createdEmail,
		password: 'ProbeCreated9!',
		email_confirm: true,
		user_metadata: { ttt_setup_attempt: created.marker, retained: 'create' }
	}),
	'admin create'
).user;
assert.ok(newUser?.id);
await assertAttempt(created.linkId, 'committed', newUser.id);
const createdRead = dataOrThrow(await service.auth.admin.getUserById(newUser.id), 'created user read').user;
assert.equal(createdRead.user_metadata?.ttt_setup_attempt, undefined, 'create marker consumed');
assert.equal(createdRead.user_metadata?.retained, 'create');
await assertPassword(createdEmail, 'ProbeCreated9!', true);

const existingUser = dataOrThrow(
	await service.auth.admin.createUser({
		email: updatedEmail,
		password: 'ProbeOriginal9!',
		email_confirm: true,
		user_metadata: { retained: 'update' }
	}),
	'preexisting user'
).user;
assert.ok(existingUser?.id);
const updated = await claimedAttempt(updatedEmail, 'provider update');
dataOrThrow(
	await service.auth.admin.updateUserById(existingUser.id, {
		password: 'ProbeUpdated9!',
		email_confirm: true,
		user_metadata: { ttt_setup_attempt: updated.marker }
	}),
	'admin update'
);
await assertAttempt(updated.linkId, 'committed', existingUser.id);
const updatedRead = dataOrThrow(await service.auth.admin.getUserById(existingUser.id), 'updated user read').user;
assert.equal(updatedRead.user_metadata?.ttt_setup_attempt, undefined, 'update marker consumed');
assert.equal(updatedRead.user_metadata?.retained, 'update');
await assertPassword(updatedEmail, 'ProbeUpdated9!', true);

const lateCreate = await claimedAttempt(lateCreateEmail, 'late create');
const createFence = dataOrThrow(
	await service.rpc('reconcile_account_setup_claim', {
		p_target_setup_link_id: lateCreate.linkId,
		p_target_access_request_id: lateCreate.requestId
	}),
	'create fence'
);
assert.equal(createFence.state, 'fenced');
const deniedCreate = await service.auth.admin.createUser({
	email: lateCreateEmail,
	password: 'ProbeLateCreated9!',
	email_confirm: true,
	user_metadata: { ttt_setup_attempt: lateCreate.marker }
});
assert.ok(deniedCreate.error, 'late create must fail');
await assertAttempt(lateCreate.linkId, 'fenced');
const lateIdentity = dataOrThrow(
	await service.from('user_email_identities').select('user_id').eq('normalized_email', lateCreateEmail),
	'late create identity'
);
assert.equal(lateIdentity.length, 0, 'late create leaves no Auth identity');

const lateUser = dataOrThrow(
	await service.auth.admin.createUser({
		email: lateUpdateEmail,
		password: 'ProbeLateOriginal9!',
		email_confirm: true
	}),
	'late update preexisting user'
).user;
assert.ok(lateUser?.id);
const lateUpdate = await claimedAttempt(lateUpdateEmail, 'late update');
const updateFence = dataOrThrow(
	await service.rpc('reconcile_account_setup_claim', {
		p_target_setup_link_id: lateUpdate.linkId,
		p_target_access_request_id: lateUpdate.requestId
	}),
	'update fence'
);
assert.equal(updateFence.state, 'fenced');
const deniedUpdate = await service.auth.admin.updateUserById(lateUser.id, {
	password: 'ProbeLateUpdated9!',
	user_metadata: { ttt_setup_attempt: lateUpdate.marker }
});
assert.ok(deniedUpdate.error, 'late update must fail');
await assertAttempt(lateUpdate.linkId, 'fenced');
await assertPassword(lateUpdateEmail, 'ProbeLateOriginal9!', true);
await assertPassword(lateUpdateEmail, 'ProbeLateUpdated9!', false);

console.log('Disposable GoTrue create/update witnesses and late-write fences passed.');
