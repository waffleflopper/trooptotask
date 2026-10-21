import type { PageServerLoad } from './$types';
import { viewerTimeZone } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import { loadArchivesSettings } from '../settingsArchives.server';
import { loadSettingsPage } from '../settingsLoad.server';
import { createSettingsArchivesContext } from '../settingsRequestContexts.server';
import { ARCHIVED_PEOPLE_DEPENDENCY } from '../settingsDependencies';

export const load: PageServerLoad = (event) => {
	event.depends(ARCHIVED_PEOPLE_DEPENDENCY, VIEWER_DAY_DEPENDENCY);
	return loadSettingsPage(event, createSettingsArchivesContext, async (ctx, { common }) => ({
		archivesSettings: await loadArchivesSettings(ctx, {
			isAdmin: common.isAdmin,
			timeZone: viewerTimeZone(event.cookies)
		})
	}));
};
