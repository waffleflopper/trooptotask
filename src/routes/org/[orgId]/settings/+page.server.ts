import { redirect } from '@sveltejs/kit';
import { buildLayoutRequest } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoad } from './$types';
import { loadSettingsOrganization, buildSettingsPageOrganization } from './settingsLoad.server';

export const load: PageServerLoad = async (event) => {
	event.depends('app:org-core');
	const identity = await loadSettingsOrganization(event);
	const organization = buildSettingsPageOrganization(identity);
	if (identity.suspendedAt) redirect(303, `/org/${organization.urlSegment}`);
	await buildLayoutRequest(event.locals, identity.id);
	redirect(303, `/org/${organization.urlSegment}/settings/general`);
};
