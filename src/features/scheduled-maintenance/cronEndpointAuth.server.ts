import { timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';

export function assertCronEndpointAuthorized(authHeader: string | null, secrets: Array<string | undefined>): void {
	const configuredSecrets = secrets
		.map((secret) => secret?.trim())
		.filter((secret): secret is string => Boolean(secret));

	if (configuredSecrets.length === 0) {
		error(500, 'Cleanup secret is not configured');
	}

	if (!authHeader) {
		error(401, 'Unauthorized');
	}

	const isAuthorized = configuredSecrets.some((secret) => timingSafeStringEqual(authHeader, `Bearer ${secret}`));

	if (!isAuthorized) {
		error(401, 'Unauthorized');
	}
}

function timingSafeStringEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	const maxLength = Math.max(leftBuffer.length, rightBuffer.length);
	const paddedLeft = Buffer.alloc(maxLength);
	const paddedRight = Buffer.alloc(maxLength);
	leftBuffer.copy(paddedLeft);
	rightBuffer.copy(paddedRight);
	return timingSafeEqual(paddedLeft, paddedRight) && leftBuffer.length === rightBuffer.length;
}
