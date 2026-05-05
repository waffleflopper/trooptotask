import { fail as actionFail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createConfiguredDutyRosterTemplate,
	listDutyRosterTemplates,
	loadDutyRosterTemplateSetupOptions
} from '$lib/server/core/useCases/dutyRosterTemplates';

function formValues(formData: FormData, name: string): string[] {
	return formData.getAll(name).map((value) => String(value));
}

function parseBaselineCounts(formData: FormData): Record<string, number | null> {
	const counts: Record<string, number | null> = {};

	for (const [key, value] of formData.entries()) {
		if (!key.startsWith('baseline:')) continue;
		const raw = String(value).trim();
		counts[key.slice('baseline:'.length)] = raw ? Number(raw) : null;
	}

	return counts;
}

function actionError(error: unknown, values: Record<string, string | string[]>) {
	const status =
		error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 500;
	const message =
		status >= 500
			? 'Failed to create Duty Roster Template.'
			: error instanceof Error
				? error.message
				: 'Failed to create Duty Roster Template.';

	return actionFail(status, {
		settingsError: message,
		values
	});
}

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();

	const data = await loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => {
			const [templates, setupOptions] = await Promise.all([
				listDutyRosterTemplates(ctx),
				loadDutyRosterTemplateSetupOptions(ctx)
			]);
			return { templates, setupOptions };
		}
	});

	return {
		orgId,
		orgName: parentData.orgName,
		templates: data.templates,
		selectedTemplate: null,
		settings: null,
		acceptedRuns: [],
		setupOptions: data.setupOptions,
		view: 'new' as const
	};
};

export const actions: Actions = {
	createTemplate: async (event) => {
		const formData = await event.request.formData();
		const values = {
			name: String(formData.get('name') ?? ''),
			slug: String(formData.get('slug') ?? ''),
			shortCode: String(formData.get('shortCode') ?? ''),
			rankValues: formValues(formData, 'rankValues'),
			groupIds: formValues(formData, 'groupIds'),
			mosValues: formValues(formData, 'mosValues'),
			dutyRoleValues: formValues(formData, 'dutyRoleValues'),
			exemptPersonnelIds: formValues(formData, 'exemptPersonnelIds')
		};

		let slug: string;
		try {
			const ctx = await buildRouteContext(event);
			const template = await createConfiguredDutyRosterTemplate(ctx, {
				name: values.name,
				slug: values.slug,
				shortCode: values.shortCode,
				poolCriteria: {
					rankValues: values.rankValues,
					groupIds: values.groupIds,
					mosValues: values.mosValues,
					dutyRoleValues: values.dutyRoleValues
				},
				exemptPersonnelIds: values.exemptPersonnelIds,
				manualBaselineCounts: parseBaselineCounts(formData)
			});
			slug = template.slug;
		} catch (error) {
			return actionError(error, values);
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${slug}/generate`);
	}
};
