import type { RequestEvent } from '@sveltejs/kit';
import { auditLog } from '$lib/audit/index.server';
import {
	createIdentityPlatformSupportReader,
	createIdentityPlatformSuspensionCommands
} from '$features/identity/index.server';
import {
	createOrganizationSupportReader,
	createOrganizationSupportSuspensionCommands
} from '$features/organization/index.server';
import { createPersonnelSupportReader } from '$features/personnel/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformSupportAdministration } from './administration.server';

function composeSupportOperations(admitted: Awaited<ReturnType<typeof admitPlatformAdministrator>>) {
	return createPlatformSupportAdministration({
		identity: createIdentityPlatformSupportReader(admitted.adminClient),
		organizations: createOrganizationSupportReader(admitted.adminClient),
		personnel: createPersonnelSupportReader(admitted.adminClient),
		userSuspensionCommands: createIdentityPlatformSuspensionCommands(admitted.adminClient),
		organizationSuspensionCommands: createOrganizationSupportSuspensionCommands(admitted.adminClient),
		actorUserId: admitted.actor.userId,
		audit: { log: (entry) => auditLog(entry, admitted.requestInfo) }
	});
}

export async function createPlatformSearchOperations(event: RequestEvent) {
	const operations = composeSupportOperations(await admitPlatformAdministrator(event, ['super_admin', 'support']));
	return { search: operations.search };
}

export async function createPlatformSuspensionOperations(event: RequestEvent) {
	const operations = composeSupportOperations(
		await admitPlatformAdministrator(event, ['super_admin'], 'Super-admin access is required')
	);
	return { updateSuspension: operations.updateSuspension };
}
