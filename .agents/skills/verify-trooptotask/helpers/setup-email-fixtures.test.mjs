import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { bounceSetupLink, expireSetupLink, signedBounce } from './setup-email-fixtures.mjs';

const secret = `whsec_${Buffer.from('synthetic-signing-key-0123456').toString('base64')}`;
const now = new Date('2026-10-24T12:00:00Z');

test('a signed bounce verifies under the Svix scheme the webhook uses', () => {
	const { body, headers } = signedBounce({ secret, emailId: 'synthetic-mail-3', reason: 'No such mailbox', now });
	const expected = createHmac('sha256', Buffer.from('synthetic-signing-key-0123456'))
		.update(`${headers['svix-id']}.${headers['svix-timestamp']}.${body}`)
		.digest('base64');
	assert.equal(headers['svix-signature'], `v1,${expected}`);
	assert.equal(headers['svix-timestamp'], String(now.getTime() / 1000));
	assert.deepEqual(JSON.parse(body), {
		type: 'email.bounced',
		created_at: now.toISOString(),
		data: { email_id: 'synthetic-mail-3', bounce: { message: 'No such mailbox' } }
	});
});

test('a bounce can name only a synthetic mail ID and needs the owned secret', () => {
	assert.throws(() => signedBounce({ secret, emailId: 're_realMessage123', reason: 'x', now }));
	assert.throws(() => signedBounce({ secret: 'plain', emailId: 'synthetic-mail-3', reason: 'x', now }));
	assert.throws(() => signedBounce({ secret, emailId: 'synthetic-mail-3', reason: '', now }));
});

const link = (fields) => ({ id: 'link-1', used_at: null, revoked_at: null, resend_email_id: null, ...fields });
const seed = { requests: { approve: { id: 'request-1' } } };
const client = (links, updates = []) => ({
	from: () => ({
		select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: links, error: null }) }) }) }),
		update: (patch) => ({
			eq: async (_column, id) => {
				updates.push({ id, patch });
				return { data: null, error: null };
			}
		})
	})
});

test('bouncing posts to the owned origin for the newest link only', async () => {
	const sent = [];
	const result = await bounceSetupLink({
		client: client([link({ resend_email_id: 'synthetic-mail-7' })]),
		seed,
		targetKey: 'approve',
		secret,
		origin: 'http://127.0.0.1:4100',
		reason: 'Mailbox does not exist',
		fetch: async (url, init) => {
			sent.push({ url: String(url), init });
			return new Response('{"received":true}', { status: 200 });
		}
	});
	assert.equal(sent[0].url, 'http://127.0.0.1:4100/api/webhooks/resend');
	assert.equal(result.status, 200);
	assert.equal(result.emailId, 'synthetic-mail-7');
});

test('bouncing refuses a link whose email was never sent, and an unknown request', async () => {
	await assert.rejects(
		bounceSetupLink({ client: client([link({})]), seed, targetKey: 'approve', secret, origin: 'http://x', reason: 'r' })
	);
	await assert.rejects(
		bounceSetupLink({ client: client([]), seed, targetKey: 'approve', secret, origin: 'http://x', reason: 'r' })
	);
	await assert.rejects(
		bounceSetupLink({ client: client([]), seed, targetKey: 'missing', secret, origin: 'http://x', reason: 'r' })
	);
});

test('expiring moves only a live link into the past', async () => {
	const updates = [];
	await expireSetupLink({ client: client([link({})], updates), seed, targetKey: 'approve' });
	assert.equal(updates.length, 1);
	assert.ok(Date.parse(updates[0].patch.expires_at) < Date.now());
	assert.deepEqual(Object.keys(updates[0].patch), ['expires_at']);
	await assert.rejects(expireSetupLink({ client: client([link({ revoked_at: 'x' })]), seed, targetKey: 'approve' }));
});
