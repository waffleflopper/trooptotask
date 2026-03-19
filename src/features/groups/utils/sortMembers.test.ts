import { describe, it, expect } from 'vitest';
import { sortMembers } from './sortMembers';
import type { OrganizationMember } from '$lib/types';

function makeMember(
	overrides: Partial<OrganizationMember> & { email: string; role: OrganizationMember['role'] }
): OrganizationMember {
	return {
		id: crypto.randomUUID(),
		organizationId: 'org-1',
		userId: crypto.randomUUID(),
		scopedGroupId: null,
		createdAt: new Date().toISOString(),
		canViewCalendar: false,
		canEditCalendar: false,
		canViewPersonnel: false,
		canEditPersonnel: false,
		canViewTraining: false,
		canEditTraining: false,
		canViewOnboarding: false,
		canEditOnboarding: false,
		canViewLeadersBook: false,
		canEditLeadersBook: false,
		canManageMembers: false,
		...overrides
	};
}

describe('sortMembers', () => {
	it('pins owner to the top regardless of email', () => {
		const members = [
			makeMember({ email: 'alice@example.com', role: 'member' }),
			makeMember({ email: 'zara@example.com', role: 'owner' }),
			makeMember({ email: 'bob@example.com', role: 'admin' })
		];

		const sorted = sortMembers(members);

		expect(sorted[0].role).toBe('owner');
		expect(sorted[0].email).toBe('zara@example.com');
	});

	it('sorts remaining members alphabetically by email (case-insensitive)', () => {
		const members = [
			makeMember({ email: 'Charlie@example.com', role: 'member' }),
			makeMember({ email: 'owner@example.com', role: 'owner' }),
			makeMember({ email: 'alice@example.com', role: 'admin' }),
			makeMember({ email: 'bob@example.com', role: 'member' })
		];

		const sorted = sortMembers(members);

		expect(sorted[0].email).toBe('owner@example.com');
		expect(sorted[1].email).toBe('alice@example.com');
		expect(sorted[2].email).toBe('bob@example.com');
		expect(sorted[3].email).toBe('Charlie@example.com');
	});

	it('is idempotent — sorting twice gives the same result', () => {
		const members = [
			makeMember({ email: 'zara@example.com', role: 'member' }),
			makeMember({ email: 'owner@example.com', role: 'owner' }),
			makeMember({ email: 'alice@example.com', role: 'admin' })
		];

		const first = sortMembers(members);
		const second = sortMembers(first);

		expect(second.map((m) => m.email)).toEqual(first.map((m) => m.email));
	});

	it('works with a single owner member', () => {
		const members = [makeMember({ email: 'solo@example.com', role: 'owner' })];

		const sorted = sortMembers(members);

		expect(sorted).toHaveLength(1);
		expect(sorted[0].email).toBe('solo@example.com');
	});

	it('does not mutate the original array', () => {
		const members = [
			makeMember({ email: 'bob@example.com', role: 'member' }),
			makeMember({ email: 'alice@example.com', role: 'owner' })
		];
		const originalOrder = members.map((m) => m.email);

		sortMembers(members);

		expect(members.map((m) => m.email)).toEqual(originalOrder);
	});
});
