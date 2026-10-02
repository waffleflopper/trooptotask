import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { OrganizationFileUploadRegistration } from '$features/organization/contracts';

/** Membership/capability facts admitted by delivery; provider credentials stay there. */
export interface SignInRosterFileActor {
	userId: string;
	orgId: string;
	role: 'owner' | 'admin' | 'member';
	isPrivileged: boolean;
	canManageMembers: boolean;
	capabilityMap: CapabilityMap;
	scopeSet: ScopeSet;
}

/** The request must admit this exact roster before privileged file transport opens. */
export interface SignInRosterFileWritePort {
	forRoster(
		actor: SignInRosterFileActor,
		rosterId: string
	): Promise<{
		upload(path: string, file: unknown): Promise<OrganizationFileUploadRegistration>;
		remove(path: string): Promise<void>;
	}>;
}
