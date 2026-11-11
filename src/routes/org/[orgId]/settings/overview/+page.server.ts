import type { PageServerLoad } from './$types';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadSettingsOverview } from '../settingsOverview.server';
import { createSettingsOverviewContext } from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsOverviewContext, (ctx) => ({
		settingsOverview: loadSettingsOverview(ctx)
	}));
