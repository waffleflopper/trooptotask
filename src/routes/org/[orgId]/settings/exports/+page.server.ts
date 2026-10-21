import type { PageServerLoad } from './$types';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadExportsSettings } from '../settingsExports.server';
import { createSettingsUnitSummaryContext } from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsUnitSummaryContext, (ctx) => ({
		exportsSettings: loadExportsSettings(ctx)
	}));
