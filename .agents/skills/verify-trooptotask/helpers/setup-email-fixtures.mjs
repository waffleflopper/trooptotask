import { createHmac, randomUUID } from 'node:crypto';

const checked = (result) => {
	if (result.error) throw new Error('Owned setup-email fixture failed: ' + result.error.message);
	return result.data;
};

// Only the owned mail sink mints these IDs, so a bounce can never name a real Resend message.
const SYNTHETIC_MAIL_ID = /^synthetic-mail-\d+$/;
const SECRET = /^whsec_[A-Za-z0-9+/]+={0,2}$/;

// A Svix-signed Resend bounce for one synthetic message, exactly as the webhook verifies it.
export function signedBounce({ secret, emailId, reason, now = new Date() }) {
	if (!SECRET.test(secret ?? '')) throw new Error('Use the owned session webhook secret.');
	if (!SYNTHETIC_MAIL_ID.test(emailId ?? '')) throw new Error('Use a synthetic mail ID from the owned mail sink.');
	if (typeof reason !== 'string' || !reason || reason.length > 200)
		throw new Error('Use a bounce reason of up to 200 characters.');
	const body = JSON.stringify({
		type: 'email.bounced',
		created_at: now.toISOString(),
		data: { email_id: emailId, bounce: { message: reason } }
	});
	const id = `msg_${randomUUID().replaceAll('-', '')}`;
	const timestamp = String(Math.floor(now.getTime() / 1000));
	const signature = createHmac('sha256', Buffer.from(secret.slice('whsec_'.length), 'base64'))
		.update(`${id}.${timestamp}.${body}`)
		.digest('base64');
	return {
		body,
		headers: {
			'content-type': 'application/json',
			'svix-id': id,
			'svix-timestamp': timestamp,
			'svix-signature': `v1,${signature}`
		}
	};
}

function requestOf(seed, targetKey) {
	const request = seed?.requests?.[targetKey];
	if (!request) throw new Error('Seed platform-admin first and use a recorded request key.');
	return request;
}

const LINK_COLUMNS =
	'id,created_at,expires_at,claimed_at,used_at,revoked_at,revocation_reason,resend_email_id,bounced_at,bounce_reason';

async function newestLink(client, requestId) {
	const links = checked(
		await client
			.from('account_setup_links')
			.select(LINK_COLUMNS)
			.eq('access_request_id', requestId)
			.order('created_at', { ascending: false })
			.limit(1)
	);
	if (!links.length) throw new Error('That request has no setup link. Approve it in the Inbox first.');
	return links[0];
}

// Posts a bounce for the request's newest setup link to the owned app's real webhook route.
export async function bounceSetupLink({ client, seed, targetKey, secret, origin, reason, fetch: send = fetch }) {
	const link = await newestLink(client, requestOf(seed, targetKey).id);
	if (!link.resend_email_id) throw new Error('The newest setup link has no recorded mail ID. Send its email first.');
	const signed = signedBounce({ secret, emailId: link.resend_email_id, reason });
	const response = await send(new URL('/api/webhooks/resend', origin), { method: 'POST', ...signed });
	return { status: response.status, body: await response.text(), emailId: link.resend_email_id };
}

// Moves the newest unused link past its expiry without touching anything else.
export async function expireSetupLink({ client, seed, targetKey }) {
	const link = await newestLink(client, requestOf(seed, targetKey).id);
	if (link.used_at || link.revoked_at) throw new Error('Only the live setup link can be expired.');
	checked(
		await client
			.from('account_setup_links')
			.update({ expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
			.eq('id', link.id)
	);
	return { linkId: link.id };
}

// Exact synthetic readback: link lifecycle, delivery, the request, the audit trail and any inviter notification.
export async function readSetupEmail({ client, seed, targetKey }) {
	const request = requestOf(seed, targetKey);
	return {
		request: checked(
			await client
				.from('access_requests')
				.select('id,email,status,reviewed_at,rescinded_at,setup_completed_at')
				.eq('id', request.id)
		),
		links: checked(
			await client
				.from('account_setup_links')
				.select(LINK_COLUMNS)
				.eq('access_request_id', request.id)
				.order('created_at', { ascending: false })
		),
		deliveries: checked(
			await client
				.from('auth_email_outbox')
				.select('id,setup_link_id,status,attempt_count,sent_at,last_error')
				.eq('access_request_id', request.id)
				.order('created_at', { ascending: false })
		),
		audit: checked(
			await client
				.from('audit_logs')
				.select('id,action,user_id,severity,timestamp')
				.eq('resource_id', request.id)
				.gte('timestamp', seed.seededAt)
				.order('timestamp')
		),
		notifications: checked(
			await client
				.from('notifications')
				.select('id,user_id,type,message,link,read')
				.eq('organization_id', seed.organization.id)
				.eq('type', 'setup_email_address_check')
		),
		boundary: 'Privileged exact-target provider readback; distinct from native/ordinary HTTP proof.'
	};
}
