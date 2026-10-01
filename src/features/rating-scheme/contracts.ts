import type { CapabilityMap, MembershipRole, ScopeSet } from '$lib/access/memberAccessShape';

/** Evaluation facts needed for browser-local Dashboard due calculations. */
export interface RatingSchemeDueEntry {
	ratingPeriodEnd: string;
	status: 'active' | 'completed' | 'change-of-rater';
}

/** Trusted request facts supplied after Organization admission. */
export interface RatingSchemeDueActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: MembershipRole;
	readonly isPrivileged: boolean;
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
}

/** Optional Dashboard projection governed by Rating Scheme's own lane and row scope. */
export interface RatingSchemeDuePort {
	listDueEntries(actor: RatingSchemeDueActor): Promise<RatingSchemeDueEntry[]>;
}

export { getRatingDueStatus } from './utils/ratingScheme';
