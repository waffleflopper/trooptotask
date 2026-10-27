import type { PageServerLoad } from './$types';
import { loadCalendarSettingsRankCatalog } from './calendarSettingsLoad.server';

export const load: PageServerLoad = async (event) => {
	event.depends('app:org-core');
	return { rankCatalog: await loadCalendarSettingsRankCatalog(event) };
};
