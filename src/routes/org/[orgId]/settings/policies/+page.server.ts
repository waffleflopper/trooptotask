import type { PageServerLoad } from './$types';
import { loadPoliciesSettings } from '../settingsPolicies.server';
import { loadSettingsPage } from '../settingsLoad.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx, { common }) => ({
		policiesSettings: await loadPoliciesSettings(ctx, { isAdmin: common.isAdmin })
	}));
