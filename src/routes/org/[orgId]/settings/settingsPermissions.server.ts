import { error } from '@sveltejs/kit';
import type { OrganizationMemberPermissions } from '$lib/types';

interface SettingsParentData {
	orgSuspended?: boolean;
	permissions?: OrganizationMemberPermissions;
}

export function getSettingsPermissions(parentData: SettingsParentData): OrganizationMemberPermissions | undefined {
	if (parentData.orgSuspended) return undefined;
	if (!parentData.permissions) error(500, 'Permissions not loaded from parent org layout');
	return parentData.permissions;
}
