import { fail } from '$lib/server/core/errors';
import { sanitizeString, validateUUID } from '$lib/server/validation';

export interface PlatformAdministrationUserStats {
	total: number;
	last_30_days: number;
}

export interface PlatformAdministrationSignupTrendPoint {
	date: string;
	count: number;
}

export interface PlatformAdministrationRecentActivity {
	id: string;
	action: string;
	user_id: string | null;
	timestamp: string;
	[key: string]: unknown;
}

export interface PlatformAdministrationDashboard {
	userStats: PlatformAdministrationUserStats;
	signupTrend: PlatformAdministrationSignupTrendPoint[];
	totalOrganizations: number;
	pendingAccessRequests: number;
	pendingFeedback: number;
	recentActivity: PlatformAdministrationRecentActivity[];
}

export interface PlatformAdministrationSearchUserRow {
	id: string;
	email: string | null;
}

export interface PlatformAdministrationSearchOrganizationRow {
	id: string;
	name: string;
}

export interface PlatformAdministrationUserSearchResult {
	id: string;
	email: string;
	orgCount: number;
}

export interface PlatformAdministrationOrganizationSearchResult {
	id: string;
	name: string;
	personnelCount: number;
}

export interface PlatformAdministrationSearchResult {
	users: PlatformAdministrationUserSearchResult[];
	organizations: PlatformAdministrationOrganizationSearchResult[];
}

export interface PlatformAdministrationSuspensionCommand {
	type: string;
	targetId: string;
	action: string;
	reason?: string;
}

export interface PlatformAdministrationAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

export interface PlatformAdministrationStore {
	countPlatformUsers(): Promise<PlatformAdministrationUserStats | null>;
	listDailySignupsLast30Days(): Promise<PlatformAdministrationSignupTrendPoint[] | null>;
	countOrganizations(): Promise<number | null>;
	countPendingAccessRequests(): Promise<number | null>;
	countPendingFeedback(): Promise<number | null>;
	listRecentActivity(limit: number): Promise<PlatformAdministrationRecentActivity[]>;
	searchUsersByEmail(input: { query: string; maxResults: number }): Promise<PlatformAdministrationSearchUserRow[]>;
	countOrganizationsForUser(userId: string): Promise<number | null>;
	searchOrganizationsByName(input: {
		query: string;
		maxResults: number;
	}): Promise<PlatformAdministrationSearchOrganizationRow[]>;
	countActivePersonnelForOrganization(organizationId: string): Promise<number | null>;
	suspendUser(input: { userId: string; suspendedBy: string; reason?: string }): Promise<void>;
	unsuspendUser(userId: string): Promise<void>;
	suspendOrganization(input: { organizationId: string; suspendedAt: Date }): Promise<void>;
	unsuspendOrganization(organizationId: string): Promise<void>;
}

export interface PlatformAdministrationDependencies {
	store: PlatformAdministrationStore;
	actorUserId: string;
	audit(event: PlatformAdministrationAuditEvent): void;
	now?: () => Date;
}

export interface PlatformAdministration {
	dashboard(): Promise<PlatformAdministrationDashboard>;
	search(input: { query: string }): Promise<PlatformAdministrationSearchResult>;
	updateSuspension(input: PlatformAdministrationSuspensionCommand): Promise<{ success: true }>;
}

const SEARCH_MAX_RESULTS = 5;
const RECENT_ACTIVITY_LIMIT = 10;
const DEFAULT_USER_STATS: PlatformAdministrationUserStats = { total: 0, last_30_days: 0 };

function normalizePlatformAdministrationSearchQuery(query: string): string | null {
	const sanitized = sanitizeString(query, 100);
	if (sanitized.length < 3) return null;
	return sanitized;
}

function parseSuspensionCommand(input: PlatformAdministrationSuspensionCommand): {
	type: 'user' | 'org';
	targetId: string;
	action: 'suspend' | 'unsuspend';
	reason?: string;
} {
	if (!['user', 'org'].includes(input.type)) {
		fail(400, 'Invalid type');
	}
	if (!validateUUID(input.targetId)) {
		fail(400, 'Invalid target ID');
	}
	if (!['suspend', 'unsuspend'].includes(input.action)) {
		fail(400, 'Invalid action');
	}

	return {
		type: input.type as 'user' | 'org',
		targetId: input.targetId,
		action: input.action as 'suspend' | 'unsuspend',
		reason: input.reason?.trim() || undefined
	};
}

export function createPlatformAdministration(deps: PlatformAdministrationDependencies): PlatformAdministration {
	const now = deps.now ?? (() => new Date());

	return {
		async dashboard() {
			const [userStats, signupTrend, totalOrganizations, pendingAccessRequests, pendingFeedback, recentActivity] =
				await Promise.all([
					deps.store.countPlatformUsers(),
					deps.store.listDailySignupsLast30Days(),
					deps.store.countOrganizations(),
					deps.store.countPendingAccessRequests(),
					deps.store.countPendingFeedback(),
					deps.store.listRecentActivity(RECENT_ACTIVITY_LIMIT)
				]);

			return {
				userStats: userStats ?? DEFAULT_USER_STATS,
				signupTrend: signupTrend ?? [],
				totalOrganizations: totalOrganizations ?? 0,
				pendingAccessRequests: pendingAccessRequests ?? 0,
				pendingFeedback: pendingFeedback ?? 0,
				recentActivity
			};
		},

		async search(input) {
			const query = normalizePlatformAdministrationSearchQuery(input.query);
			if (!query) return { users: [], organizations: [] };

			const [matchedUsers, matchedOrganizations] = await Promise.all([
				deps.store.searchUsersByEmail({ query, maxResults: SEARCH_MAX_RESULTS }),
				deps.store.searchOrganizationsByName({ query, maxResults: SEARCH_MAX_RESULTS })
			]);

			const [users, organizations] = await Promise.all([
				Promise.all(
					matchedUsers.map(async (user) => ({
						id: user.id,
						email: user.email ?? '',
						orgCount: (await deps.store.countOrganizationsForUser(user.id)) ?? 0
					}))
				),
				Promise.all(
					matchedOrganizations.map(async (organization) => ({
						id: organization.id,
						name: organization.name,
						personnelCount: (await deps.store.countActivePersonnelForOrganization(organization.id)) ?? 0
					}))
				)
			]);

			return { users, organizations };
		},

		async updateSuspension(input) {
			const command = parseSuspensionCommand(input);

			if (command.type === 'user') {
				if (command.action === 'suspend') {
					await deps.store.suspendUser({
						userId: command.targetId,
						suspendedBy: deps.actorUserId,
						reason: command.reason
					});
				} else {
					await deps.store.unsuspendUser(command.targetId);
				}
			} else if (command.action === 'suspend') {
				await deps.store.suspendOrganization({
					organizationId: command.targetId,
					suspendedAt: now()
				});
			} else {
				await deps.store.unsuspendOrganization(command.targetId);
			}

			deps.audit({
				action: `${command.action}_${command.type}`,
				resourceType: command.type === 'user' ? 'user' : 'organization',
				resourceId: command.targetId,
				details: { reason: command.reason },
				severity: 'critical'
			});

			return { success: true };
		}
	};
}
