import type { PageServerLoad } from './$types';
import { loadArchivesSettings } from '../settingsArchives.server';
import { loadSettingsPage } from '../settingsLoad.server';
import { createSettingsArchivesContext } from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsArchivesContext, async (ctx, { common }) => ({
		archivesSettings: await loadArchivesSettings(ctx, { isAdmin: common.isAdmin })
	}));
