import type { RequestEvent } from '@sveltejs/kit';
import type { PlatformSupportAdminRole } from '../organizationSupportTypes';
import { admitPlatformAdministrator } from './admission.server';

export const PLATFORM_ADMIN_PAGE_ROLES = {
	dashboard: ['super_admin', 'support', 'billing'],
	users: ['super_admin', 'support'],
	organizations: ['super_admin', 'support'],
	'access-requests': ['super_admin', 'support'],
	feedback: ['super_admin', 'support'],
	audit: ['super_admin'],
	announcements: ['super_admin']
} as const satisfies Record<string, readonly PlatformSupportAdminRole[]>;

export type PlatformAdminPage = keyof typeof PLATFORM_ADMIN_PAGE_ROLES;

export function getAccessiblePlatformPages(role: PlatformSupportAdminRole): PlatformAdminPage[] {
	return (Object.keys(PLATFORM_ADMIN_PAGE_ROLES) as PlatformAdminPage[]).filter((page) => {
		const roles: readonly PlatformSupportAdminRole[] = PLATFORM_ADMIN_PAGE_ROLES[page];
		return roles.includes(role);
	});
}

export async function loadPlatformAdminNavigation(event: RequestEvent) {
	const { actor, role, requestInfo } = await admitPlatformAdministrator(event, PLATFORM_ADMIN_PAGE_ROLES.dashboard);
	return {
		adminUserId: actor.userId,
		adminEmail: requestInfo.userEmail ?? undefined,
		adminRole: role,
		accessiblePages: getAccessiblePlatformPages(role)
	};
}
