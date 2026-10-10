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
