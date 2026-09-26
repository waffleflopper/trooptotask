import { z } from 'zod';
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { Personnel } from '$lib/types';

/** Stable Organization Group identity and display order. */
export interface Group {
	id: string;
	name: string;
	sortOrder: number;
}

/** Canonical Personnel facts used when saving a Sign-in Roster snapshot. */
export interface SignInRosterPersonnelLookupRecord {
	id: string;
	rank?: string | null;
	lastName?: string | null;
	firstName?: string | null;
	groupId?: string | null;
	groupName?: string | null;
}

export interface SignInRosterPersonnelLookupPort {
	findPersonnelForRosterSnapshot(orgId: string, personnelIds: string[]): Promise<SignInRosterPersonnelLookupRecord[]>;
}

/** Trusted request authorization facts; structurally matches the shared AuthContext. */
export interface PersonnelRosterActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly isPrivileged: boolean;
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
}

export interface PersonnelCalendarRosterPort {
	listActive(actor: PersonnelRosterActor): Promise<Personnel[]>;
	listAssigneeIds(actor: PersonnelRosterActor): Promise<string[]>;
	findGroupIds(actor: PersonnelRosterActor, personnelIds: string[]): Promise<Map<string, string | null>>;
}

/** Personnel facts exposed to the Onboarding lane after Onboarding authorization. */
export interface PersonnelOnboardingRosterPort {
	listRoster(actor: PersonnelRosterActor, status: 'active' | 'all'): Promise<Personnel[]>;
	findGroupIds(actor: PersonnelRosterActor, personnelIds: string[]): Promise<Map<string, string | null>>;
}

/** Personnel facts exposed to the Training lane after purpose-specific authorization. */
export interface PersonnelTrainingRosterPort {
	listActiveForWorkspace(actor: PersonnelRosterActor): Promise<Personnel[]>;
	listActiveForReports(actor: PersonnelRosterActor): Promise<Personnel[]>;
	findGroupIdsForWrites(actor: PersonnelRosterActor, personnelIds: string[]): Promise<Map<string, string | null>>;
}

/** Personnel facts exposed to Critical Tasks after its own lane admission. */
export interface PersonnelCriticalTasksRosterPort {
	listActiveForReadiness(actor: PersonnelRosterActor): Promise<Personnel[]>;
	findForHistory(actor: PersonnelRosterActor, personnelId: string): Promise<Personnel | null>;
	listForBatchImport(actor: PersonnelRosterActor): Promise<Personnel[]>;
	findForCompletionWrite(
		actor: PersonnelRosterActor,
		personnelId: string
	): Promise<{ groupId: string | null; archivedAt: string | null } | null>;
}

export {
	createRosterReadModel,
	formatRosterPersonDisplayName,
	matchesRosterSearch,
	rosterGroupFilterValue
} from './rosterReadModel';
export type {
	CreateRosterReadModelInput,
	PersonnelGroup,
	RosterGroupFilterOption,
	RosterReadModel,
	RosterReadModelView,
	RosterScopeSelection,
	RosterStatus,
	RosterViewOptions
} from './rosterReadModel';

/** JSON note returned by the current Personnel page, API and archive operations. */
export interface PersonnelLeaderNote {
	id: string;
	personnelId: string;
	/** Organization member label, stored author fallback, or Unknown leader. */
	author: string;
	/** YYYY-MM-DD, derived from createdAt. */
	date: string;
	text: string;
	/** Timestamp string. */
	createdAt: string;
	/** Timestamp string when archived; null when active. */
	archivedAt: string | null;
}

export const personnelLeaderNoteInputSchema = z.object({
	personnelId: z.string().min(1),
	text: z.string().trim().min(1, 'Leader note is required').max(4000)
});

export type PersonnelLeaderNoteInput = z.infer<typeof personnelLeaderNoteInputSchema>;
