import type { PageServerLoad } from './$types';
import { viewerToday } from '$lib/server/viewerDay.server';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadPoliciesSettings } from '../settingsPolicies.server';
import { createSettingsPoliciesContext } from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsPoliciesContext, async (ctx) => ({
		policiesSettings: await loadPoliciesSettings(ctx, { today: viewerToday(event.cookies) })
	}));
