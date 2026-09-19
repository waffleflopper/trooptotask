import type { PageServerLoad } from './$types';
import { loadSettingsPage } from '../settingsLoad.server';

export const load: PageServerLoad = (event) => loadSettingsPage(event, () => ({}));
