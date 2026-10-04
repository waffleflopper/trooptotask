import type { PageServerLoad } from './$types';
import { loadSettingsPage } from '../settingsLoad.server';
import { createRequestEmptyContext } from '$lib/server/adapters/requestContexts.server';

export const load: PageServerLoad = (event) => loadSettingsPage(event, createRequestEmptyContext, () => ({}));
