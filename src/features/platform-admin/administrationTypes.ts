import type { AuditPort } from '$lib/audit/contracts';
import type { IdentityPlatformSupportReader, IdentityPlatformSuspensionCommands } from '$features/identity/contracts';
import type {
	OrganizationSupportReader,
	OrganizationSupportSuspensionCommands
} from '$features/organization/contracts';
import type { PersonnelSupportReader } from '$features/personnel/contracts';

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

export interface PlatformSuspensionCommand {
	type: 'user' | 'org';
	targetId: string;
	action: 'suspend' | 'unsuspend';
	reason?: string;
}

export type PlatformSuspensionCommandParseResult =
	| { status: 'valid'; command: PlatformSuspensionCommand }
	| { status: 'invalid_input'; message: string };

export type PlatformSuspensionResult =
	| { status: 'updated'; success: true }
	| { status: 'invalid_input'; message: string };

/** Delivery supplies admitted actor identity and source-owned capabilities. */
export interface PlatformSupportAdministrationDependencies {
	identity: Pick<IdentityPlatformSupportReader, 'searchUsersByEmail'>;
	organizations: Pick<OrganizationSupportReader, 'searchOrganizationsByName' | 'listMembershipUserIds'>;
	personnel: Pick<PersonnelSupportReader, 'countActivePersonnelByOrganization'>;
	userSuspensionCommands: IdentityPlatformSuspensionCommands;
	organizationSuspensionCommands: OrganizationSupportSuspensionCommands;
	actorUserId: string;
	audit: AuditPort;
	now?: () => Date;
}

export interface PlatformSupportAdministration {
	search(input: { query: string }): Promise<PlatformAdministrationSearchResult>;
	updateSuspension(input: unknown): Promise<PlatformSuspensionResult>;
}
