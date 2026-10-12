import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PROVIDER_FAULTS } from '../../../../scripts/verification/outbound-controls.mjs';

const confirmDestinations = { recovery: '/auth/reset-password', invite: '/auth/accept-invite' };

export function textboxUid(snapshot, label, occurrence) {
	const matches = snapshot.split('\n').filter((line) => line.includes(`textbox ${JSON.stringify(label)}`));
	const index = occurrence === undefined ? 0 : Number(occurrence) - 1;
	if (
		(occurrence === undefined && matches.length !== 1) ||
		!Number.isSafeInteger(index) ||
		index < 0 ||
		!matches[index]
	)
		throw new Error(
			`Expected ${occurrence ? `occurrence ${occurrence} of` : 'one'} ${label} field, found ${matches.length}.`
		);
	const uid = matches[index].match(/uid=([^\s]+)/)?.[1];
	if (!uid) throw new Error(`The ${label} field has no snapshot UID.`);
	return uid;
}

export function redactAuthTokens(value) {
	return value.replace(/([?&](?:token_hash|token)=)[^&\s"'#]+/g, '$1[REDACTED]');
}

/** The same `/auth/confirm` shape the app's auth email delivery builds. */
export function authConfirmUrl(origin, type, tokenHash) {
	const next = confirmDestinations[type];
	if (!next || !tokenHash) throw new Error('Use a recovery or invite link with a provider token.');
	const url = new URL('/auth/confirm', origin);
	url.searchParams.set('type', type);
	url.searchParams.set('next', next);
	url.searchParams.set('token_hash', tokenHash);
	return url.toString();
}

export function syntheticEmail(value) {
	const email = String(value ?? '')
		.trim()
		.toLowerCase();
	if (!/^[^@\s]+@example\.test$/.test(email)) throw new Error('Use a synthetic @example.test email.');
	return email;
}

/** Public synthetic addresses for the identity actors; passwords and factors stay private. */
export function identityEmails(fixture) {
	return Object.fromEntries(fixture.identityActors.map((role) => [role, fixture.actors[role].email]));
}

const setupLinkStates = {
	valid: () => ({}),
	claimed: (recent) => ({ claimed_at: recent }),
	expired: () => ({}),
	replaced: (recent) => ({ revoked_at: recent, revocation_reason: 'replaced' }),
	failed: (recent) => ({ claimed_at: recent, failed_at: recent, failure_reason: 'account-create-failed' }),
	'not-approved': () => ({})
};
export const setupLinkClasses = Object.keys(setupLinkStates);

/** One synthetic Access Request and Account Setup Link per page state; the app stores only the token hash. */
export function accountSetupSeed(tag, now = Date.now()) {
	const recent = new Date(now - 3_600_000).toISOString();
	return Object.fromEntries(
		setupLinkClasses.map((kind) => {
			const rawToken = randomBytes(32).toString('base64url');
			const request = {
				id: randomUUID(),
				email: `setup-${tag}-${kind}@example.test`,
				name: `Synthetic Setup ${kind}`,
				status: kind === 'not-approved' ? 'pending' : 'approved',
				approval_basis: kind === 'not-approved' ? null : 'platform_review'
			};
			const link = {
				id: randomUUID(),
				access_request_id: request.id,
				token_hash: createHash('sha256').update(rawToken, 'utf8').digest('hex'),
				expires_at: new Date(now + (kind === 'expired' ? -86_400_000 : 86_400_000)).toISOString(),
				...setupLinkStates[kind](recent)
			};
			return [kind, { request, link, rawToken }];
		})
	);
}

export function setupAccountUrl(origin, rawToken) {
	const url = new URL('/auth/setup-account', origin);
	url.searchParams.set('token', rawToken);
	return url.toString();
}

const mailKinds = { setup: 'account-setup', auth: 'auth', invitation: 'invitation' };

export function mailKind(value) {
	if (!Object.hasOwn(mailKinds, value)) throw new Error('Use setup, auth or invitation.');
	return mailKinds[value];
}

export function mailRequest(args) {
	const [action, ...rest] = args;
	if (['state', 'restore'].includes(action) && !rest.length) return { command: 'mail', action };
	const count = /^\d+$/.test(rest.at(-1) ?? '') ? Number(rest.pop()) : undefined;
	if (action !== 'fail' || rest.length > 1 || (rest.length && !Object.hasOwn(mailKinds, rest[0])))
		throw new Error('Use mail state|restore or mail fail [setup|auth|invitation] [COUNT].');
	return {
		command: 'mail',
		action,
		...(rest.length ? { kind: mailKind(rest[0]) } : {}),
		...(count === undefined ? {} : { count })
	};
}

export function faultRequest(args) {
	const [action, name, ordinal] = args;
	const usage = `Use fault state|restore or fault arm ${Object.keys(PROVIDER_FAULTS).join('|')} [ORDINAL].`;
	if (['state', 'restore'].includes(action) && args.length === 1) return { command: 'fault', action };
	if (action !== 'arm' || args.length < 2 || args.length > 3 || !Object.hasOwn(PROVIDER_FAULTS, name))
		throw new Error(usage);
	return { command: 'fault', action, name, ...(ordinal === undefined ? {} : { ordinal: Number(ordinal) }) };
}

// `setup_grant_live` is the computed field that reads `access_request_setup_grant_is_live`.
const accessRequestColumns =
	'id,email,name,reason,heard_about,heard_about_details,status,approval_basis,setup_grant_live,created_at,reviewed_at,reviewed_by,setup_user_id,setup_completed_at';

export async function readAccessRequests(client, email) {
	const rows = checkedRows(
		await client.from('access_requests').select(accessRequestColumns).eq('email', email).order('created_at')
	);
	const ids = rows.map(({ id }) => id);
	if (!ids.length) return { email, count: 0, rows, setupLinks: [], invitationLinks: [] };
	const setupLinks = checkedRows(
		await client
			.from('account_setup_links')
			.select(
				'id,access_request_id,expires_at,claimed_at,used_at,failed_at,failure_reason,revoked_at,revocation_reason'
			)
			.in('access_request_id', ids)
	);
	const links = checkedRows(
		await client
			.from('access_request_organization_invitation_links')
			.select('id,access_request_id,organization_invitation_id,organization_id,invited_by,invited_at')
			.in('access_request_id', ids)
	);
	const invitations = links.length
		? checkedRows(
				await client
					.from('organization_invitations')
					.select('id,status')
					.in(
						'id',
						links.map((link) => link.organization_invitation_id)
					)
			)
		: [];
	const status = new Map(invitations.map((invitation) => [invitation.id, invitation.status]));
	return {
		email,
		count: rows.length,
		rows,
		setupLinks,
		invitationLinks: links.map((link) => ({
			...link,
			invitation_status: status.get(link.organization_invitation_id) ?? null
		}))
	};
}

function checkedRows(result) {
	if (result.error) throw new Error(`Disposable provider operation failed: ${result.error.message}`);
	return result.data;
}
