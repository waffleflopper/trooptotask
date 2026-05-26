import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	findDutyRosterTemplateBySlug,
	listAcceptedDutyRosterTemplateRunHistory,
	listDutyRosterTemplates,
	loadDutyRosterTemplateCountReadModel
} from '$lib/server/core/useCases/dutyRosterTemplates';
export { actions } from '../../[view]/+page.server';

export const load: PageServerLoad = async ({ params, url, locals, cookies, parent }) => {
	const { orgId, templateSlug, historyId } = params;
	const parentData = await parent();
	const mode: 'roster' | 'da6' = url.searchParams.get('mode') === 'da6' ? 'da6' : 'roster';

	const data = await loadWithContext(locals, cookies, orgId, {
		policyAction: POLICY_ACTION_CATALOG.calendar.viewDutyRosters,
		policyResource: { kind: 'unscoped' },
		fn: async (ctx) => {
			const [templates, selectedTemplate] = await Promise.all([
				listDutyRosterTemplates(ctx),
				findDutyRosterTemplateBySlug(ctx, templateSlug)
			]);

			if (!selectedTemplate) {
				throw error(404, 'Duty Roster Template not found');
			}

			const [acceptedRunHistory, countReadModel] = await Promise.all([
				listAcceptedDutyRosterTemplateRunHistory(ctx, selectedTemplate.id, { includeRunId: historyId }),
				loadDutyRosterTemplateCountReadModel(ctx, selectedTemplate)
			]);
			if (!acceptedRunHistory.runs.some((run) => run.id === historyId)) {
				throw error(404, 'Duty Roster Run not found');
			}

			return { templates, selectedTemplate, acceptedRunHistory, countReadModel };
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
		acceptedRuns: data.acceptedRunHistory.runs,
		historyPage: data.acceptedRunHistory,
		countReadModel: data.countReadModel,
		view: 'history' as const,
		historyDetailRunId: historyId,
		historyDetailMode: mode
	};
};
