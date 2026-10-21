import type { PageServerLoad } from './$types';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadFeaturesSettings } from '../settingsFeatures.server';
import { createSettingsFeaturesContext } from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsFeaturesContext, async (ctx) => ({
		featuresSettings: await loadFeaturesSettings(ctx)
	}));
