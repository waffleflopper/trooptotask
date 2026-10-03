import { createRequestDeletionRequestStore } from '$lib/server/adapters/httpAdapter';
import type { PageServerLoad } from './$types';
import { loadApprovalsSettings } from '../settingsApprovals.server';
import { loadSettingsPage } from '../settingsLoad.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx) => ({
		approvalsSettings: await loadApprovalsSettings({
			auth: ctx.auth,
			audit: ctx.audit,
			store: createRequestDeletionRequestStore(event.locals)
		})
	}));
