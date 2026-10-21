import { createRequestDeletionRequestStore } from '$lib/server/adapters/httpAdapter';
import type { PageServerLoad } from './$types';
import { loadApprovalsSettings } from '../settingsApprovals.server';
import { loadSettingsPage } from '../settingsLoad.server';
import { createSettingsApprovalsContext } from '../settingsRequestContexts.server';
import { PENDING_APPROVALS_DEPENDENCY } from '../settingsDependencies';

export const load: PageServerLoad = (event) => {
	event.depends(PENDING_APPROVALS_DEPENDENCY);
	return loadSettingsPage(event, createSettingsApprovalsContext, async (ctx) =>
		loadApprovalsSettings({ auth: ctx.auth, audit: ctx.audit, store: createRequestDeletionRequestStore(event.locals) })
	);
};
