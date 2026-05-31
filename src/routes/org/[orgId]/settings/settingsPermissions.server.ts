import { error } from '@sveltejs/kit';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { AppShellRouteData } from '$lib/server/core/orgShell';

export function getSettingsPermissions(parentData: AppShellRouteData): OrganizationMemberPermissions | undefined {
	if (parentData.shell.kind === 'suspended') return undefined;
	if (!parentData.shell.member.permissions) error(500, 'Permissions not loaded from parent org layout');
	return parentData.shell.member.permissions;
}
