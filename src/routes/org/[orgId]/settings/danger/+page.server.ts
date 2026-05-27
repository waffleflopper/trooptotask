import { redirect } from '@sveltejs/kit';
import { actions, loadSettingsWorkspacePage } from '../+page.server';
import type { OrganizationSettingsWorkspace } from '../organizationSettingsWorkspaceModel';
import type { PageServerLoad } from './$types';

type OwnerGuardSettingsData = {
	orgUrlSegment: string;
	workspace: OrganizationSettingsWorkspace;
};

export { actions };

export const load: PageServerLoad = async (event) => {
	const data = (await loadSettingsWorkspacePage(
		event as unknown as Parameters<typeof loadSettingsWorkspacePage>[0]
	)) as OwnerGuardSettingsData;
	if (!data.workspace.currentMember.isOwner) {
		redirect(303, `/org/${data.orgUrlSegment}/settings/general`);
	}

	return data;
};
