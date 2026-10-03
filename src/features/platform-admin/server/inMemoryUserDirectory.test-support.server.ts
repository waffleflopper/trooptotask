import type {
	PlatformDirectoryAuthUser,
	PlatformUserDirectoryMembership,
	PlatformUserDirectoryDependencies,
	PlatformUserDirectorySuspension
} from '../userDirectoryTypes';

export interface InMemoryPlatformUserDirectoryOptions {
	authUsers?: PlatformDirectoryAuthUser[];
	memberships?: PlatformUserDirectoryMembership[];
	suspensions?: PlatformUserDirectorySuspension[];
	authError?: string;
	authDetailError?: string;
}

function cloneAuthUser(user: PlatformDirectoryAuthUser): PlatformDirectoryAuthUser {
	return { ...user };
}

function cloneMembership(membership: PlatformUserDirectoryMembership): PlatformUserDirectoryMembership {
	return {
		...membership,
		organization: membership.organization ? { ...membership.organization } : null
	};
}

function cloneSuspension(suspension: PlatformUserDirectorySuspension): PlatformUserDirectorySuspension {
	return { ...suspension };
}

export function createInMemoryPlatformUserDirectorySources(
	options: InMemoryPlatformUserDirectoryOptions = {}
): Pick<PlatformUserDirectoryDependencies, 'identity' | 'organizations'> {
	const authUsers = [...(options.authUsers ?? [])].map(cloneAuthUser);
	const memberships = [...(options.memberships ?? [])].map(cloneMembership);
	const suspensions = [...(options.suspensions ?? [])].map(cloneSuspension);

	return {
		identity: {
			async listAuthUsers() {
				if (options.authError) return { status: 'auth_error', message: options.authError };
				return { status: 'ok', users: authUsers.map(cloneAuthUser) };
			},
			async getAuthUser(userId) {
				if (options.authDetailError) return { status: 'auth_error', message: options.authDetailError };
				const user = authUsers.find((candidate) => candidate.id === userId);
				return user ? { status: 'ok', user: cloneAuthUser(user) } : { status: 'not_found' };
			},
			async listSuspendedUserIds(userIds) {
				const requestedIds = new Set(userIds);
				return suspensions
					.filter((suspension) => requestedIds.has(suspension.userId))
					.map((suspension) => suspension.userId);
			},
			async getSuspensionForUser(userId) {
				const suspension = suspensions.find((candidate) => candidate.userId === userId);
				return suspension ? cloneSuspension(suspension) : null;
			}
		},
		organizations: {
			async listMembershipUserIds(userIds) {
				const requestedIds = new Set(userIds);
				return memberships
					.filter((membership) => requestedIds.has(membership.userId))
					.map((membership) => membership.userId);
			},
			async listMembershipsForUser(userId) {
				return memberships.filter((membership) => membership.userId === userId).map(cloneMembership);
			}
		}
	};
}
