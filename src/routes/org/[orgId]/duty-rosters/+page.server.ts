import { fail as actionFail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createDutyRosterTemplate, listDutyRosterTemplates } from '$lib/server/core/useCases/dutyRosterTemplates';

function actionError(error: unknown, values: { name?: string; shortCode?: string }) {
	const status =
		error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 500;
	const message =
		status >= 500
			? 'Failed to create Duty Roster Template.'
			: error instanceof Error
				? error.message
				: 'Failed to create Duty Roster Template.';

	return actionFail(status, {
		error: message,
		values
	});
}

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();

	const templates = await loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: listDutyRosterTemplates
	});

	return {
		orgId,
		orgName: parentData.orgName,
		templates,
		selectedTemplate: templates[0] ?? null,
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
			return actionError(error, values);
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${slug}/generate`);
	}
};
