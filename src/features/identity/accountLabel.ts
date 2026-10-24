import type { SignedInAccount } from './contracts';

export function accountLabel(account: Pick<SignedInAccount, 'email' | 'profile'>): { name: string; initials: string } {
	const profile = account.profile.status === 'loaded' ? account.profile.profile : null;
	const firstName = profile?.firstName.trim() ?? '';
	const lastName = profile?.lastName.trim() ?? '';
	const email = account.email?.trim() ?? '';

	if (firstName || lastName) {
		return {
			name: [profile?.rank.trim(), firstName, lastName].filter(Boolean).join(' '),
			initials: [firstName, lastName]
				.filter(Boolean)
				.map((part) => part[0])
				.join('')
				.toUpperCase()
		};
	}
	if (email) return { name: email, initials: email[0].toUpperCase() };
	return { name: 'Account', initials: 'A' };
}
