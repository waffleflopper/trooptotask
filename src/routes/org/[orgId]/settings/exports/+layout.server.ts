import { LAST_EXPORT_DEPENDENCY, type LastExportData } from '$features/data-export/index.web';
import type { LayoutServerLoad } from './$types';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadLastExport } from '../settingsExports.server';
import { createSettingsUnitSummaryContext } from '../settingsRequestContexts.server';

export const load = (async (event): Promise<{ lastExport: LastExportData }> => {
	event.depends(LAST_EXPORT_DEPENDENCY);
	const data = await loadSettingsPage(event, createSettingsUnitSummaryContext, (ctx) => ({
		lastExport: loadLastExport(ctx)
	}));
	return { lastExport: 'lastExport' in data ? data.lastExport : null };
}) satisfies LayoutServerLoad;
