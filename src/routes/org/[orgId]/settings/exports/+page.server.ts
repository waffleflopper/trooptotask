import type { PageServerLoad } from './$types';
import { loadExportsSettings } from '../settingsExports.server';
import { loadSettingsPage } from '../settingsLoad.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx) => ({
		exportsSettings: await loadExportsSettings(ctx)
	}));
