import { error, fail as actionFail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	acceptDutyRosterTemplatePreview,
	acceptAndApplyDutyRosterTemplatePreview,
	applyAcceptedDutyRosterTemplateRun,
	applyDutyRosterTemplatePreviewManualSelection,
	findDutyRosterTemplateBySlug,
	generateDutyRosterTemplatePreview,
	invalidateLatestDutyRosterTemplateRun,
	listAcceptedDutyRosterTemplateRuns,
	listDutyRosterTemplates,
	loadDutyRosterTemplateCountReadModel,
	loadDutyRosterTemplateSettings,
	recordDutyRosterTemplateRunCorrection,
	updateDutyRosterTemplateSettings
} from '$lib/server/core/useCases/dutyRosterTemplates';
import { isDutyRosterTemplateView } from '$features/duty-roster/templates/dutyRosterTemplates';

type ActionErrorKey =
	| 'generateError'
	| 'manualError'
	| 'settingsError'
	| 'applyError'
	| 'invalidateError'
	| 'correctionError';

function formValues(formData: FormData, name: string): string[] {
	return formData.getAll(name).map((value) => String(value));
}

function parseBaselineCounts(formData: FormData): Record<string, number | null> {
	const counts: Record<string, number | null> = {};

	for (const [key, value] of formData.entries()) {
		if (!key.startsWith('baseline:')) {
			continue;
		}

		const personId = key.slice('baseline:'.length);
		const raw = String(value).trim();
		counts[personId] = raw ? Number(raw) : null;
	}

	return counts;
}

function actionError(
	errorValue: unknown,
	input: {
		key: ActionErrorKey;
		fallback: string;
		values?: Record<string, string>;
	}
) {
	const status =
		errorValue && typeof errorValue === 'object' && 'status' in errorValue && typeof errorValue.status === 'number'
			? errorValue.status
			: 500;
	const message = status >= 500 ? input.fallback : errorValue instanceof Error ? errorValue.message : input.fallback;

	const data = input.values ? { [input.key]: message, generateValues: input.values } : { [input.key]: message };
	return actionFail(status, data);
}

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

			const settings = view === 'settings' ? await loadDutyRosterTemplateSettings(ctx, selectedTemplate) : null;
			const countReadModel = await loadDutyRosterTemplateCountReadModel(ctx, selectedTemplate);
			const acceptedRuns =
				view === 'settings' || view === 'history'
					? await listAcceptedDutyRosterTemplateRuns(ctx, selectedTemplate.id)
					: [];

			return { templates, selectedTemplate, settings, acceptedRuns, countReadModel };
		}
	});

	return {
		orgId,
		orgName: parentData.orgName,
		templates: data.templates,
		selectedTemplate: data.selectedTemplate,
		settings: data.settings,
		acceptedRuns: data.acceptedRuns,
		countReadModel: data.countReadModel,
		view
	};
};

export const actions: Actions = {
	generatePreview: async (event) => {
		const formData = await event.request.formData();
		const values = {
			startDate: String(formData.get('startDate') ?? ''),
			endDate: String(formData.get('endDate') ?? '')
		};

		try {
			const ctx = await buildRouteContext(event);
			const preview = await generateDutyRosterTemplatePreview(ctx, {
				templateId: String(formData.get('templateId') ?? ''),
				startDate: values.startDate,
				endDate: values.endDate
			});

			return { preview, generateValues: values };
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'generateError',
				fallback: 'Failed to generate Duty Roster preview.',
				values
			});
		}
	},
	manualPreviewSelection: async (event) => {
		const formData = await event.request.formData();
		const preview = String(formData.get('preview') ?? '');
		const values = {
			startDate: String(formData.get('startDate') ?? ''),
			endDate: String(formData.get('endDate') ?? '')
		};

		try {
			const ctx = await buildRouteContext(event);
			const updatedPreview = await applyDutyRosterTemplatePreviewManualSelection(ctx, {
				preview,
				date: String(formData.get('date') ?? ''),
				assigneeId: String(formData.get('assigneeId') ?? ''),
				reason: String(formData.get('reason') ?? '')
			});

			return { preview: updatedPreview, generateValues: values };
		} catch (errorValue) {
			const status =
				errorValue && typeof errorValue === 'object' && 'status' in errorValue && typeof errorValue.status === 'number'
					? errorValue.status
					: 500;
			const message =
				status >= 500
					? 'Failed to update the manual preview selection.'
					: errorValue instanceof Error
						? errorValue.message
						: 'Failed to update the manual preview selection.';
			let submittedPreview: unknown = null;
			try {
				submittedPreview = JSON.parse(preview);
			} catch {
				submittedPreview = null;
			}

			return actionFail(status, { manualError: message, preview: submittedPreview, generateValues: values });
		}
	},
	acceptPreview: async (event) => {
		const formData = await event.request.formData();

		try {
			const ctx = await buildRouteContext(event);
			const acceptedRun = await acceptDutyRosterTemplatePreview(ctx, {
				preview: String(formData.get('preview') ?? '')
			});
			if (String(formData.get('intent') ?? '') === 'print') {
				return { acceptedRun, printAcceptedRun: true };
			}
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'generateError',
				fallback: 'Failed to accept Duty Roster preview.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history`);
	},
	applyPreview: async (event) => {
		const formData = await event.request.formData();

		try {
			const ctx = await buildRouteContext(event);
			await acceptAndApplyDutyRosterTemplatePreview(ctx, {
				preview: String(formData.get('preview') ?? '')
			});
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'generateError',
				fallback: 'Failed to apply Duty Roster preview to Calendar.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history`);
	},
	applyAcceptedRun: async (event) => {
		const formData = await event.request.formData();

		try {
			const ctx = await buildRouteContext(event);
			await applyAcceptedDutyRosterTemplateRun(ctx, {
				runId: String(formData.get('runId') ?? '')
			});
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'applyError',
				fallback: 'Failed to apply accepted Duty Roster Run to Calendar.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history`);
	},
	invalidateAcceptedRun: async (event) => {
		const formData = await event.request.formData();

		try {
			const ctx = await buildRouteContext(event);
			await invalidateLatestDutyRosterTemplateRun(ctx, {
				runId: String(formData.get('runId') ?? '')
			});
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'invalidateError',
				fallback: 'Failed to invalidate accepted Duty Roster Run.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history`);
	},
	recordCorrection: async (event) => {
		const formData = await event.request.formData();

		try {
			const ctx = await buildRouteContext(event);
			await recordDutyRosterTemplateRunCorrection(ctx, {
				runId: String(formData.get('runId') ?? ''),
				runRowDate: String(formData.get('runRowDate') ?? ''),
				replacementAssigneeId: String(formData.get('replacementAssigneeId') ?? ''),
				reason: String(formData.get('reason') ?? '')
			});
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'correctionError',
				fallback: 'Failed to record Duty Roster Correction.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history`);
	},
	updateSettings: async (event) => {
		const formData = await event.request.formData();

		try {
			const ctx = await buildRouteContext(event);
			await updateDutyRosterTemplateSettings(ctx, {
				templateId: String(formData.get('templateId') ?? ''),
				poolCriteria: {
					rankValues: formValues(formData, 'rankValues'),
					groupIds: formValues(formData, 'groupIds'),
					mosValues: formValues(formData, 'mosValues'),
					dutyRoleValues: formValues(formData, 'dutyRoleValues')
				},
				exemptPersonnelIds: formValues(formData, 'exemptPersonnelIds'),
				manualBaselineCounts: parseBaselineCounts(formData)
			});
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'settingsError',
				fallback: 'Failed to update Duty Roster Template settings.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/settings`);
	}
};
