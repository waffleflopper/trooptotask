import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { findDutyRosterTemplateBySlug, listDutyRosterTemplates } from '$lib/server/core/useCases/dutyRosterTemplates';
import { isDutyRosterTemplateView } from '$features/duty-roster/templates/dutyRosterTemplates';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId, templateSlug, view } = params;
	const parentData = await parent();

	if (!isDutyRosterTemplateView(view)) {
		throw redirect(303, `/org/${orgId}/duty-rosters/${templateSlug}/generate`);
	}

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

			return { templates, selectedTemplate };
		}
	});

	return {
		orgId,
		orgName: parentData.orgName,
		templates: data.templates,
		selectedTemplate: data.selectedTemplate,
		view
	};
};
