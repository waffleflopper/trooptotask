import type { SettingsMemberRow } from './contracts';

export type OwnershipTransferCandidate = Pick<SettingsMemberRow, 'id' | 'userId' | 'email' | 'membershipRole'> & {
	/** What the unit calls them, when they have a name; the email still identifies and confirms the transfer. */
	name: string | null;
};

/** "SFC Dana Whitaker (dana@example.com)" for a named candidate, else the email. */
export function ownershipCandidateLabel({ name, email }: Pick<OwnershipTransferCandidate, 'name' | 'email'>): string {
	return name ? `${name} (${email})` : (email ?? 'Unknown member');
}
