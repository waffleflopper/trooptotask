export const MAX_INVITES_PER_SUBMISSION = 50;

/** What one address in an invite submission came to. `already-invited` means a pending invitation already covers it. */
export type InviteAddressResult =
	| { email: string; status: 'invited'; message: string }
	| { email: string; status: 'already-invited'; message: string }
	| { email: string; status: 'failed'; message: string };

/**
 * The distinct addresses in pasted text, lowercased, in the order first given. Commas, semicolons, spaces and line
 * breaks separate addresses. A mail client's `Name <address>` keeps only the address.
 */
export function parseInviteAddresses(text: string): string[] {
	const addresses = text
		.replace(/"[^"]*"/g, ' ')
		.split(/[,;\n]/)
		.flatMap((entry) => {
			const pieces = entry.split(/(<[^<>]*>)/);
			const named = pieces.length > 1;
			return pieces.flatMap((piece, index) => {
				if (index % 2 === 1) return [piece.slice(1, -1)];
				const words = piece.split(/[\s<>]+/);
				return named ? words.filter((word) => word.includes('@')) : words;
			});
		});
	return [...new Set(addresses.flatMap((part) => (part.trim() ? [part.trim().toLowerCase()] : [])))];
}

/** The addresses an admin still has to act on: the ones no invitation covers yet. */
export function addressesToRetry(results: readonly InviteAddressResult[]): string[] {
	return results.flatMap((result) => (result.status === 'failed' ? [result.email] : []));
}
