import type { CapabilityMap, GroupCoverage } from '$lib/access/memberAccessShape';
import type { FileCleanup } from '$features/organization/contracts';

export {
	emptySignInRosterFilter,
	filterSignInRosterPersonnel,
	matchesSignInRosterFilter,
	signInRosterFilterOptions,
	signInRosterRankCategoryGroups
} from './signInRosterFilter';
export type {
	SignInRosterFilter,
	SignInRosterFilterPerson,
	SignInRosterRankQuickFilterCategory
} from './signInRosterFilter';

export const ROSTER_UNAVAILABLE_MESSAGE = 'This roster is no longer available.';

/** Membership/capability facts admitted by delivery; provider credentials stay there. */
export interface SignInRosterFileActor {
	userId: string;
	orgId: string;
	role: 'owner' | 'admin' | 'member';
	isPrivileged: boolean;
	capabilityMap: CapabilityMap;
	scopeSet: GroupCoverage;
}

export interface SignInRosterScanPort {
	/** Uploads bytes under `path`, then makes them the roster's current scan. */
	replace(actor: SignInRosterFileActor, rosterId: string, path: string, file: unknown): Promise<void>;
	/** Clears the scan only while it still points at `expectedPath`. */
	remove(actor: SignInRosterFileActor, rosterId: string, expectedPath: string): Promise<FileCleanup>;
	deleteRoster(actor: SignInRosterFileActor, rosterId: string): Promise<{ title: string; fileCleanup: FileCleanup }>;
}
