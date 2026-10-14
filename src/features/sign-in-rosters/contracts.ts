import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { FileCleanup } from '$features/organization/contracts';

/** Membership/capability facts admitted by delivery; provider credentials stay there. */
export interface SignInRosterFileActor {
	userId: string;
	orgId: string;
	role: 'owner' | 'admin' | 'member';
	isPrivileged: boolean;
	capabilityMap: CapabilityMap;
	scopeSet: ScopeSet;
}

export interface SignInRosterScanPort {
	/** Uploads bytes under `path`, then makes them the roster's current scan. */
	replace(actor: SignInRosterFileActor, rosterId: string, path: string, file: unknown): Promise<void>;
	/** Clears the scan only while it still points at `expectedPath`. */
	remove(actor: SignInRosterFileActor, rosterId: string, expectedPath: string): Promise<FileCleanup>;
	deleteRoster(actor: SignInRosterFileActor, rosterId: string): Promise<{ title: string; fileCleanup: FileCleanup }>;
}
