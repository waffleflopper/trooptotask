import type { OrganizationMember } from '$lib/types';

export function sortMembers(members: OrganizationMember[]): OrganizationMember[] {
	return [...members].sort((a, b) => {
		if (a.role === 'owner' && b.role !== 'owner') return -1;
		if (b.role === 'owner' && a.role !== 'owner') return 1;
		return (a.email ?? '').localeCompare(b.email ?? '', undefined, { sensitivity: 'base' });
	});
}
