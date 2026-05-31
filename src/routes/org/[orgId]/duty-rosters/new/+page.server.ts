import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createConfiguredDutyRosterTemplate,
	listDutyRosterTemplates,
	loadDutyRosterTemplateSetupOptions
} from '$lib/server/core/useCases/dutyRosterTemplates';
import {
	dutyRosterActionError,
	dutyRosterBaselineFormValues,
	dutyRosterFormValues,
	parseDutyRosterBaselineCounts
} from '../routeHelpers.server';
import { requireReadyAppShell } from '$lib/server/core/appShellRouteData';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const shell = requireReadyAppShell(await parent());

	const data = await loadWithContext(locals, cookies, orgId, {
		policyAction: POLICY_ACTION_CATALOG.calendar.configureDutyTemplates,
		policyResource: { kind: 'unscoped' },
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
		orgName: shell.org.name,
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
			rankValues: dutyRosterFormValues(formData, 'rankValues'),
			groupIds: dutyRosterFormValues(formData, 'groupIds'),
			mosValues: dutyRosterFormValues(formData, 'mosValues'),
			dutyRoleValues: dutyRosterFormValues(formData, 'dutyRoleValues'),
			exemptPersonnelIds: dutyRosterFormValues(formData, 'exemptPersonnelIds'),
			manualBaselineCounts: dutyRosterBaselineFormValues(formData)
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
				manualBaselineCounts: parseDutyRosterBaselineCounts(formData)
			});
			slug = template.slug;
		} catch (error) {
			return dutyRosterActionError(error, {
				key: 'settingsError',
				fallback: 'Failed to create Duty Roster Template.',
				values
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${slug}/generate`);
	}
};
