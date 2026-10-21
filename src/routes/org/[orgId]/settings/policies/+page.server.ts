import type { PageServerLoad } from './$types';
import { viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadPoliciesSettings } from '../settingsPolicies.server';
import { createSettingsPoliciesContext } from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) => {
	event.depends(VIEWER_DAY_DEPENDENCY);
	return loadSettingsPage(event, createSettingsPoliciesContext, async (ctx) => ({
		policiesSettings: await loadPoliciesSettings(ctx, { today: viewerToday(event.cookies) })
	}));
};
