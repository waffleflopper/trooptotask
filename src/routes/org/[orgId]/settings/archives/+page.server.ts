import type { PageServerLoad } from './$types';
import { loadArchivesSettings } from '../settingsArchives.server';
import { loadSettingsPage } from '../settingsLoad.server';
import { createSettingsArchivesContext } from '../settingsRequestContexts.server';
import { ARCHIVED_PEOPLE_DEPENDENCY } from '../settingsDependencies';

export const load: PageServerLoad = (event) => {
	event.depends(ARCHIVED_PEOPLE_DEPENDENCY);
	return loadSettingsPage(event, createSettingsArchivesContext, async (ctx, { common }) => ({
		archivesSettings: await loadArchivesSettings(ctx, { isAdmin: common.isAdmin })
	}));
};
