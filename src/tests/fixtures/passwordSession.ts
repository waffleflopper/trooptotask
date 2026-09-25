// Synthetic claims for already-verified request fixtures. Not a signed provider token.
export function passwordSessionToken(
	actor: string,
	label = 'admitted',
	session = '00000000-0000-4000-8000-000000000001',
	method: 'password' | 'otp' = 'password'
): string {
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: actor, session_id: session, amr: [{ method }], label })}.synthetic`;
}
