import type {
	IdentitySupportAccount,
	IdentitySupportAccountListResult,
	IdentitySupportAccountResult,
	IdentitySupportSuspension,
	IdentityPlatformSupportReader
} from '$features/identity/contracts';
import type { OrganizationSupportUserMembership, OrganizationSupportReader } from '$features/organization/contracts';
import type { PersonnelSupportReader } from '$features/personnel/contracts';

export type PlatformDirectoryAuthUser = IdentitySupportAccount;
export type PlatformDirectoryEmailConfirmationStatus = 'confirmed' | 'pending';
export type PlatformDirectoryAuthUserListResult = IdentitySupportAccountListResult;
export type PlatformDirectoryAuthUserResult = IdentitySupportAccountResult;
export type PlatformUserDirectoryOrganization = NonNullable<OrganizationSupportUserMembership['organization']>;
export type PlatformUserDirectoryMembership = OrganizationSupportUserMembership;
export type PlatformUserDirectorySuspension = IdentitySupportSuspension;

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

export interface PlatformUserDirectoryDependencies {
	identity: Pick<
		IdentityPlatformSupportReader,
		'listAuthUsers' | 'getAuthUser' | 'listSuspendedUserIds' | 'getSuspensionForUser'
	>;
	organizations: Pick<OrganizationSupportReader, 'listMembershipUserIds' | 'listMembershipsForUser'>;
	personnel: Pick<PersonnelSupportReader, 'countActivePersonnelByOrganization'>;
}

export interface PlatformUserDirectory {
	listUsers(input: { search: string; page: number; limit: number }): Promise<PlatformUserDirectoryList>;
	getUserDetail(userId: string): Promise<PlatformUserDirectoryDetailResult>;
}
