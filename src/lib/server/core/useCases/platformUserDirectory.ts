import type { Tier } from '$lib/types/subscription';
import type { PlatformMetrics } from './platformMetrics';

export interface PlatformDirectoryAuthUser {
	id: string;
	email: string | null;
	createdAt: string;
	lastSignInAt: string | null;
	emailConfirmedAt: string | null;
}

export type PlatformDirectoryEmailConfirmationStatus = 'confirmed' | 'pending';

export type PlatformDirectoryAuthUserListResult =
	| { status: 'ok'; users: PlatformDirectoryAuthUser[] }
	| { status: 'auth_error'; message: string };

export type PlatformDirectoryAuthUserResult =
	| { status: 'ok'; user: PlatformDirectoryAuthUser }
	| { status: 'not_found' }
	| { status: 'auth_error'; message: string };

export interface PlatformUserDirectoryOrganization {
	id: string;
	name: string;
	tier: Tier;
	giftTier: Tier | null;
}

export interface PlatformUserDirectoryMembership {
	userId: string;
	role: string;
	organization: PlatformUserDirectoryOrganization | null;
}

export interface PlatformUserDirectorySuspension {
	userId: string;
	suspendedAt: string;
	suspendedBy: string;
	reason: string | null;
}

export interface PlatformUserDirectoryListItem {
	id: string;
	email: string | null;
	organizationCount: number;
	createdAt: string;
	isSuspended: boolean;
	emailConfirmedAt: string | null;
	emailConfirmationStatus: PlatformDirectoryEmailConfirmationStatus;
}

export interface PlatformUserDirectoryList {
	users: PlatformUserDirectoryListItem[];
	totalCount: number;
	page: number;
	limit: number;
	search: string;
	authError: string | null;
}

export interface PlatformUserDirectoryDetailOrganization {
	id: string | null;
	name: string;
	role: string;
	subscriptionTier: string;
	personnelCount: number;
}

export interface PlatformUserDirectoryDetail {
	user: {
		id: string;
		email: string;
		createdAt: string;
		lastSignInAt: string | null;
		emailConfirmedAt: string | null;
		emailConfirmationStatus: PlatformDirectoryEmailConfirmationStatus;
	};
	organizations: PlatformUserDirectoryDetailOrganization[];
	suspension: {
		suspendedAt: string;
		suspendedBy: string;
		reason: string | null;
	} | null;
	isSuspended: boolean;
}

export type PlatformUserDirectoryDetailResult =
	| { status: 'found'; detail: PlatformUserDirectoryDetail }
	| { status: 'not_found' }
	| { status: 'auth_error'; message: string };

export interface PlatformUserDirectoryStore {
	listAuthUsers(): Promise<PlatformDirectoryAuthUserListResult>;
	getAuthUser(userId: string): Promise<PlatformDirectoryAuthUserResult>;
	listMembershipUserIds(userIds: string[]): Promise<string[]>;
	listSuspendedUserIds(userIds: string[]): Promise<string[]>;
	listMembershipsForUser(userId: string): Promise<PlatformUserDirectoryMembership[]>;
	getSuspensionForUser(userId: string): Promise<PlatformUserDirectorySuspension | null>;
}

export interface PlatformUserDirectoryDependencies {
	store: PlatformUserDirectoryStore;
	metrics: PlatformMetrics;
	logError?: (message: string, error: unknown) => void;
}

export interface PlatformUserDirectory {
	listUsers(input: { search: string; page: number; limit: number }): Promise<PlatformUserDirectoryList>;
	getUserDetail(userId: string): Promise<PlatformUserDirectoryDetailResult>;
}

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

async function readArrayOrEmpty<T>(
	context: string,
	label: string,
	logError: (message: string, error: unknown) => void,
	read: () => Promise<T[]>
) {
	try {
		return await read();
	} catch (error) {
		logError(`${context} Failed to read ${label}:`, error);
		return [];
	}
}

async function readNullableOrNull<T>(
	context: string,
	label: string,
	logError: (message: string, error: unknown) => void,
	read: () => Promise<T | null>
) {
	try {
		return await read();
	} catch (error) {
		logError(`${context} Failed to read ${label}:`, error);
		return null;
	}
}

export function createPlatformUserDirectory(deps: PlatformUserDirectoryDependencies): PlatformUserDirectory {
	const logError = deps.logError ?? ((message, error) => console.error(message, error));
	const logContext = '[admin/users]';

	return {
		async listUsers(input) {
			const authUsersResult = await deps.store.listAuthUsers();
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
				readArrayOrEmpty(logContext, 'organization membership counts', logError, () =>
					deps.store.listMembershipUserIds(userIds)
				),
				readArrayOrEmpty(logContext, 'user suspension states', logError, () => deps.store.listSuspendedUserIds(userIds))
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
			const authUserResult = await deps.store.getAuthUser(userId);
			if (authUserResult.status === 'not_found' || authUserResult.status === 'auth_error') return authUserResult;
			const authUser = authUserResult.user;

			const [memberships, suspension] = await Promise.all([
				readArrayOrEmpty(logContext, 'user organization memberships', logError, () =>
					deps.store.listMembershipsForUser(userId)
				),
				readNullableOrNull(logContext, 'user suspension state', logError, () => deps.store.getSuspensionForUser(userId))
			]);
			const organizationIds = memberships
				.map((membership) => membership.organization?.id)
				.filter((id): id is string => typeof id === 'string');
			const personnelCounts = await deps.metrics.countActivePersonnelByOrganization(organizationIds);

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
							subscriptionTier: org?.giftTier ?? org?.tier ?? 'free',
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
