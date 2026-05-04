import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	findDutyRosterTemplateBySlug,
	listAcceptedDutyRosterTemplateRuns,
	listDutyRosterTemplates,
	loadDutyRosterTemplateCountReadModel
} from '$lib/server/core/useCases/dutyRosterTemplates';
export { actions } from '../../[view]/+page.server';

export const load: PageServerLoad = async ({ params, url, locals, cookies, parent }) => {
	const { orgId, templateSlug, historyId } = params;
	const parentData = await parent();
	const mode: 'roster' | 'da6' = url.searchParams.get('mode') === 'da6' ? 'da6' : 'roster';

	const data = await loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => {
			const [templates, selectedTemplate] = await Promise.all([
				listDutyRosterTemplates(ctx),
				findDutyRosterTemplateBySlug(ctx, templateSlug)
			]);

			if (!selectedTemplate) {
				throw error(404, 'Duty Roster Template not found');
			}

			const [acceptedRuns, countReadModel] = await Promise.all([
				listAcceptedDutyRosterTemplateRuns(ctx, selectedTemplate.id),
				loadDutyRosterTemplateCountReadModel(ctx, selectedTemplate)
			]);
			if (!acceptedRuns.some((run) => run.id === historyId)) {
				throw error(404, 'Duty Roster Run not found');
			}

			return { templates, selectedTemplate, acceptedRuns, countReadModel };
		}
	});

	if (mode === 'roster' && url.searchParams.has('mode')) {
		throw redirect(303, `/org/${orgId}/duty-rosters/${templateSlug}/history/${historyId}`);
	}

	return {
		orgId,
		orgName: parentData.orgName,
		templates: data.templates,
		selectedTemplate: data.selectedTemplate,
		settings: null,
		acceptedRuns: data.acceptedRuns,
		countReadModel: data.countReadModel,
		view: 'history' as const,
		historyDetailRunId: historyId,
		historyDetailMode: mode
	};
};
