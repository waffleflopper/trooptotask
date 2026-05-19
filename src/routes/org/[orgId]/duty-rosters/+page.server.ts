import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	archiveDutyRosterTemplate,
	createDutyRosterTemplate,
	listDutyRosterTemplates,
	loadDutyRosterTemplateSetupOptions
} from '$lib/server/core/useCases/dutyRosterTemplates';
import { dutyRosterActionError } from './routeHelpers.server';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();

	const { templates, setupOptions } = await loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => ({
			templates: await listDutyRosterTemplates(ctx),
			setupOptions: await loadDutyRosterTemplateSetupOptions(ctx)
		})
	});

	return {
		orgId,
		orgName: parentData.orgName,
		templates,
		setupOptions,
		selectedTemplate: null,
		view: 'generate' as const
	};
};

export const actions: Actions = {
	createTemplate: async (event) => {
		const formData = await event.request.formData();
		const values = {
			name: String(formData.get('name') ?? ''),
			shortCode: String(formData.get('shortCode') ?? '')
		};

		let slug: string;
		try {
			const ctx = await buildRouteContext(event);
			const template = await createDutyRosterTemplate(ctx, values);
			slug = template.slug;
		} catch (error) {
			return dutyRosterActionError(error, {
				key: 'error',
				fallback: 'Failed to create Duty Roster Template.',
				values
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${slug}/generate`);
	},
	archiveTemplate: async (event) => {
		const formData = await event.request.formData();
		const templateId = String(formData.get('templateId') ?? '');
		const archiveAssignmentType = formData.get('archiveAssignmentType') === 'true';

		try {
			const ctx = await buildRouteContext(event);
			await archiveDutyRosterTemplate(ctx, { templateId, archiveAssignmentType });
		} catch (error) {
			return dutyRosterActionError(error, {
				key: 'error',
				fallback: 'Failed to archive Duty Roster Template.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters`);
	}
};
