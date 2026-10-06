import type { PageServerLoad } from './$types';
import { loadPoliciesSettings } from '$features/organization/index.server';
import { loadSettingsPage } from '../settingsLoad.server';
import { createSettingsPoliciesContext } from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsPoliciesContext, async (ctx, { common }) => ({
		policiesSettings: await loadPoliciesSettings(ctx, { isAdmin: common.isAdmin })
	}));
