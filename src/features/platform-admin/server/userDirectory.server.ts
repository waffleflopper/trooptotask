import type {
	PlatformDirectoryAuthUser,
	PlatformDirectoryEmailConfirmationStatus,
	PlatformUserDirectoryDependencies,
	PlatformUserDirectory
} from '../userDirectoryTypes';

function countMembershipsByUserId(userIds: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const userId of userIds) {
		counts.set(userId, (counts.get(userId) ?? 0) + 1);
	}
	return counts;
}

function emailConfirmationStatus(user: PlatformDirectoryAuthUser): PlatformDirectoryEmailConfirmationStatus {
	return user.emailConfirmedAt ? 'confirmed' : 'pending';
}

export function createPlatformUserDirectory(deps: PlatformUserDirectoryDependencies): PlatformUserDirectory {
	return {
		async listUsers(input) {
			const authUsersResult = await deps.identity.listAuthUsers();
			if (authUsersResult.status === 'auth_error') {
				return {
					users: [],
					totalCount: 0,
					page: input.page,
					limit: input.limit,
					search: input.search,
					authError: authUsersResult.message
				};
			}

			const lowerSearch = input.search.toLowerCase();
			const filteredUsers = lowerSearch
				? authUsersResult.users.filter((user) => user.email?.toLowerCase().includes(lowerSearch))
				: authUsersResult.users;
			const sortedUsers = [...filteredUsers].sort(
				(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
			);

			const totalCount = sortedUsers.length;
			const offset = (input.page - 1) * input.limit;
			const pagedUsers = sortedUsers.slice(offset, offset + input.limit);
			const userIds = pagedUsers.map((user) => user.id);
			const [membershipUserIds, suspendedUserIds] = await Promise.all([
				deps.organizations.listMembershipUserIds(userIds),
				deps.identity.listSuspendedUserIds(userIds)
			]);
			const membershipCounts = countMembershipsByUserId(membershipUserIds);
			const suspendedUserIdSet = new Set(suspendedUserIds);

			return {
				users: pagedUsers.map((user) => ({
					id: user.id,
					email: user.email,
					organizationCount: membershipCounts.get(user.id) ?? 0,
					createdAt: user.createdAt,
					isSuspended: suspendedUserIdSet.has(user.id),
					emailConfirmedAt: user.emailConfirmedAt,
					emailConfirmationStatus: emailConfirmationStatus(user)
				})),
				totalCount,
				page: input.page,
				limit: input.limit,
				search: input.search,
				authError: null
			};
		},

		async getUserDetail(userId) {
			const authUserResult = await deps.identity.getAuthUser(userId);
			if (authUserResult.status === 'not_found' || authUserResult.status === 'auth_error') return authUserResult;
			const authUser = authUserResult.user;

			const [memberships, suspension] = await Promise.all([
				deps.organizations.listMembershipsForUser(userId),
				deps.identity.getSuspensionForUser(userId)
			]);
			const organizationIds = memberships
				.map((membership) => membership.organization?.id)
				.filter((id): id is string => typeof id === 'string');
			const personnelCounts = await deps.personnel.countActivePersonnelByOrganization(organizationIds);

			return {
				status: 'found',
				detail: {
					user: {
						id: authUser.id,
						email: authUser.email ?? 'No email',
						createdAt: authUser.createdAt,
						lastSignInAt: authUser.lastSignInAt,
						emailConfirmedAt: authUser.emailConfirmedAt,
						emailConfirmationStatus: emailConfirmationStatus(authUser)
					},
					organizations: memberships.map((membership) => {
						const org = membership.organization;
						return {
							id: org?.id ?? null,
							name: org?.name ?? 'Unknown',
							role: membership.role,
							personnelCount: org?.id ? (personnelCounts.get(org.id) ?? 0) : 0
						};
					}),
					suspension: suspension
						? {
								suspendedAt: suspension.suspendedAt,
								suspendedBy: suspension.suspendedBy,
								reason: suspension.reason
							}
						: null,
					isSuspended: !!suspension
				}
			};
		}
	};
}
