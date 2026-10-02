import type { AuthContext } from '$lib/server/core/ports';
import type { OrganizationFileUploadRegistration } from '$features/organization/contracts';

/** The request must admit this exact roster before privileged file transport opens. */
export interface SignInRosterFileWritePort {
	forRoster(
		actor: AuthContext,
		rosterId: string
	): Promise<{
		upload(path: string, file: File): Promise<OrganizationFileUploadRegistration>;
		remove(path: string): Promise<void>;
	}>;
}
