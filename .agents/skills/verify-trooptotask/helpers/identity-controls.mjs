import { createHash, randomBytes, randomUUID } from 'node:crypto';

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
				status: kind === 'not-approved' ? 'pending' : 'approved'
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
