import type { LayoutServerLoad } from './$types';
import { streamReadyFeatureLaneWorkspace } from '$lib/server/adapters/featureLaneWorkspaceLoad';
import { streamCalendarWorkspaceBootstrap } from './calendarWorkspaceDelivery.server';

export function _createCalendarLayoutLoad(): LayoutServerLoad {
	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:calendar-data'],
			streamWorkspace: streamCalendarWorkspaceBootstrap
		});
}

export const load: LayoutServerLoad = _createCalendarLayoutLoad();
