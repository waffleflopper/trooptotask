export const MAX_INVITES_PER_SUBMISSION = 50;

/** What one address in an invite submission came to. `already-invited` means a pending invitation already covers it. */
export type InviteAddressResult =
	| { email: string; status: 'invited'; message: string }
	| { email: string; status: 'already-invited'; message: string }
	| { email: string; status: 'failed'; message: string };

/**
 * The distinct addresses in pasted text, lowercased, in the order first given. Commas, semicolons, spaces, line
 * breaks and the angle brackets mail clients put around an address all separate addresses.
 */
export function parseInviteAddresses(text: string): string[] {
	return [...new Set(text.split(/[\s,;<>]+/).flatMap((part) => (part ? [part.toLowerCase()] : [])))];
}

/** The addresses an admin still has to act on: the ones no invitation covers yet. */
export function addressesToRetry(results: readonly InviteAddressResult[]): string[] {
	return results.flatMap((result) => (result.status === 'failed' ? [result.email] : []));
}
