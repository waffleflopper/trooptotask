import type {
	PlatformMembershipAdministrationStore,
	PlatformMembershipOrganization,
	PlatformMembershipRecord
} from '$lib/server/core/useCases/platformMembershipAdministration';

interface InMemoryPlatformMembershipAdministrationOptions {
	organizations?: PlatformMembershipOrganization[];
	memberships?: PlatformMembershipRecord[];
	setRoleError?: Error;
}

function membershipKey(input: { orgId: string; userId: string }): string {
	return `${input.orgId}:${input.userId}`;
}

function cloneMembership(row: PlatformMembershipRecord): PlatformMembershipRecord {
	return { ...row };
}

export function createInMemoryPlatformMembershipAdministrationStore(
	options: InMemoryPlatformMembershipAdministrationOptions = {}
): PlatformMembershipAdministrationStore {
	const organizations = new Map(options.organizations?.map((org) => [org.id, { ...org }]) ?? []);
	const memberships = new Map<string, PlatformMembershipRecord>();
	for (const membership of options.memberships ?? []) {
		memberships.set(membershipKey(membership), cloneMembership(membership));
	}

	return {
		async getOrganization(orgId) {
			const org = organizations.get(orgId);
			return org ? { ...org } : null;
		},

		async listMembers(orgId) {
			return Array.from(memberships.values())
				.filter((membership) => membership.orgId === orgId)
				.sort((a, b) => a.role.localeCompare(b.role))
				.map((membership) => ({
					userId: membership.userId,
					email: membership.email ?? null,
					role: membership.role
				}));
		},

		async getMembership(input) {
			const membership = memberships.get(membershipKey(input));
			return membership ? cloneMembership(membership) : null;
		},

		async getCurrentOwner(orgId) {
			const owners = Array.from(memberships.values()).filter(
				(membership) => membership.orgId === orgId && membership.role === 'owner'
			);
			if (owners.length > 1) throw new Error('multiple current owners found');
			const owner = owners[0];
			return owner ? cloneMembership(owner) : null;
		},

		async setMembershipRole(input) {
			if (options.setRoleError) throw options.setRoleError;
			const membership = memberships.get(membershipKey(input));
			if (!membership) throw new Error('membership not found for role update');
			memberships.set(membershipKey(input), { ...membership, role: input.role });
		}
	};
}
