import { error, fail as actionFail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	acceptDutyRosterTemplatePreview,
	acceptAndApplyDutyRosterTemplatePreview,
	applyAcceptedDutyRosterTemplateRun,
	applyDutyRosterTemplatePreviewManualSelection,
	archiveDutyRosterTemplate,
	findDutyRosterTemplateBySlug,
	generateDutyRosterTemplatePreview,
	invalidateLatestDutyRosterTemplateRun,
	listAcceptedDutyRosterTemplateRunHistory,
	listDutyRosterTemplates,
	loadDutyRosterTemplateCountReadModel,
	loadDutyRosterTemplateSettings,
	recordDutyRosterTemplateRunCorrection,
	updateDutyRosterTemplateSettings
} from '$lib/server/core/useCases/dutyRosterTemplates';
import { isDutyRosterTemplateView } from '$features/duty-roster/templates/dutyRosterTemplates';
import type { DutyRosterGenerationPattern } from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';
import {
	dutyRosterActionError,
	dutyRosterActionMessage,
	dutyRosterActionStatus,
	dutyRosterFormValues,
	parseDutyRosterBaselineCounts
} from '../../routeHelpers.server';
import { requireReadyAppShell } from '$lib/server/core/appShellRouteData';

type ActionErrorKey =
	| 'generateError'
	| 'manualError'
	| 'settingsError'
	| 'applyError'
	| 'invalidateError'
	| 'correctionError';

function actionError(
	errorValue: unknown,
	input: {
		key: ActionErrorKey;
		fallback: string;
		values?: unknown;
	}
) {
	return dutyRosterActionError(errorValue, {
		...input,
		valuesKey: 'generateValues'
	});
}

const DEFAULT_HISTORY_PAGE = 1;

function parseHistoryPage(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return DEFAULT_HISTORY_PAGE;
	return Math.max(DEFAULT_HISTORY_PAGE, Math.trunc(parsed));
}

export const load: PageServerLoad = async ({ params, url, locals, cookies, parent }) => {
	const { orgId, templateSlug, view } = params;
	const shell = requireReadyAppShell(await parent());

	if (!isDutyRosterTemplateView(view)) {
		throw redirect(303, `/org/${orgId}/duty-rosters/${templateSlug}/generate`);
	}

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
			if (selectedTemplate.status === 'archived' && view !== 'history') {
				throw redirect(303, `/org/${orgId}/duty-rosters/${selectedTemplate.slug}/history`);
			}

			const historyPageNumber =
				view === 'history' ? parseHistoryPage(url.searchParams.get('page')) : DEFAULT_HISTORY_PAGE;
			const [settings, countReadModel, acceptedRunHistory] = await Promise.all([
				view === 'settings' ? loadDutyRosterTemplateSettings(ctx, selectedTemplate) : Promise.resolve(null),
				loadDutyRosterTemplateCountReadModel(ctx, selectedTemplate),
				listAcceptedDutyRosterTemplateRunHistory(ctx, selectedTemplate.id, { page: historyPageNumber })
			]);

			return { templates, selectedTemplate, settings, acceptedRunHistory, countReadModel };
		}
	});

	return {
		orgId,
		orgName: shell.org.name,
		breadcrumbLabel: data.selectedTemplate.name,
		templates: data.templates,
		selectedTemplate: data.selectedTemplate,
		settings: data.settings,
		acceptedRuns: data.acceptedRunHistory.runs,
		historyPage: data.acceptedRunHistory,
		countReadModel: data.countReadModel,
		view
	};
};

export const actions: Actions = {
	generatePreview: async (event) => {
		const formData = await event.request.formData();
		const values = {
			startDate: String(formData.get('startDate') ?? ''),
			endDate: String(formData.get('endDate') ?? ''),
			pattern: parseGenerationPattern(formData.get('pattern')),
			selectedWeekdays: parseSelectedWeekdays(formData),
			skipHolidaysAndDonsas: String(formData.get('skipHolidaysAndDonsas') ?? '') === 'true'
		};

		try {
			const ctx = await buildRouteContext(event);
			const preview = await generateDutyRosterTemplatePreview(ctx, {
				templateId: String(formData.get('templateId') ?? ''),
				startDate: values.startDate,
				endDate: values.endDate,
				pattern: values.pattern,
				selectedWeekdays: values.selectedWeekdays,
				skipHolidaysAndDonsas: values.skipHolidaysAndDonsas
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
			const status = dutyRosterActionStatus(errorValue);
			const message = dutyRosterActionMessage(errorValue, 'Failed to update the manual preview selection.');
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
		let acceptedRunId = '';

		try {
			const ctx = await buildRouteContext(event);
			const acceptedRun = await acceptDutyRosterTemplatePreview(ctx, {
				preview: String(formData.get('preview') ?? '')
			});
			acceptedRunId = acceptedRun.id;
			if (String(formData.get('intent') ?? '') === 'print') {
				return { acceptedRun, printAcceptedRun: true };
			}
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'generateError',
				fallback: 'Failed to accept Duty Roster preview.'
			});
		}

		throw redirect(
			303,
			`/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history/${acceptedRunId}`
		);
	},
	applyPreview: async (event) => {
		const formData = await event.request.formData();
		let acceptedRunId = '';

		try {
			const ctx = await buildRouteContext(event);
			const result = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
				preview: String(formData.get('preview') ?? '')
			});
			acceptedRunId = result.acceptedRun.id;
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'generateError',
				fallback: 'Failed to accept and apply Duty Roster preview to Calendar.'
			});
		}

		throw redirect(
			303,
			`/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history/${acceptedRunId}`
		);
	},
	applyAcceptedRun: async (event) => {
		const formData = await event.request.formData();
		const runId = String(formData.get('runId') ?? '');

		try {
			const ctx = await buildRouteContext(event);
			await applyAcceptedDutyRosterTemplateRun(ctx, {
				runId,
				calendarSyncPlanToken: String(formData.get('calendarSyncPlanToken') ?? '') || null
			});
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'applyError',
				fallback: 'Failed to apply accepted Duty Roster Run to Calendar.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history/${runId}`);
	},
	invalidateAcceptedRun: async (event) => {
		const formData = await event.request.formData();
		const runId = String(formData.get('runId') ?? '');
		const cascade = String(formData.get('cascade') ?? '') === 'true';

		try {
			const ctx = await buildRouteContext(event);
			await invalidateLatestDutyRosterTemplateRun(ctx, {
				runId,
				cascade
			});
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'invalidateError',
				fallback: 'Failed to invalidate accepted Duty Roster Run.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history/${runId}`);
	},
	recordCorrection: async (event) => {
		const formData = await event.request.formData();
		const runId = String(formData.get('runId') ?? '');

		try {
			const ctx = await buildRouteContext(event);
			await recordDutyRosterTemplateRunCorrection(ctx, {
				runId,
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

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${event.params.templateSlug}/history/${runId}`);
	},
	updateSettings: async (event) => {
		const formData = await event.request.formData();
		let slug = event.params.templateSlug;

		try {
			const ctx = await buildRouteContext(event);
			const updated = await updateDutyRosterTemplateSettings(ctx, {
				templateId: String(formData.get('templateId') ?? ''),
				name: String(formData.get('name') ?? ''),
				slug: String(formData.get('slug') ?? ''),
				shortCode: String(formData.get('shortCode') ?? ''),
				poolCriteria: {
					rankValues: dutyRosterFormValues(formData, 'rankValues'),
					groupIds: dutyRosterFormValues(formData, 'groupIds'),
					mosValues: dutyRosterFormValues(formData, 'mosValues'),
					dutyRoleValues: dutyRosterFormValues(formData, 'dutyRoleValues')
				},
				exemptPersonnelIds: dutyRosterFormValues(formData, 'exemptPersonnelIds'),
				manualBaselineCounts: parseDutyRosterBaselineCounts(formData)
			});
			slug = updated.slug;
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'settingsError',
				fallback: 'Failed to update Duty Roster Template settings.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters/${slug}/settings`);
	},
	archiveTemplate: async (event) => {
		const formData = await event.request.formData();

		try {
			const ctx = await buildRouteContext(event);
			await archiveDutyRosterTemplate(ctx, {
				templateId: String(formData.get('templateId') ?? ''),
				archiveAssignmentType: formData.get('archiveAssignmentType') === 'true'
			});
		} catch (errorValue) {
			return actionError(errorValue, {
				key: 'settingsError',
				fallback: 'Failed to archive Duty Roster Template.'
			});
		}

		throw redirect(303, `/org/${event.params.orgId}/duty-rosters`);
	}
};

function parseGenerationPattern(value: FormDataEntryValue | null): DutyRosterGenerationPattern {
	const pattern = String(value ?? 'daily');
	return pattern === 'weekday-only' || pattern === 'weekend-only' || pattern === 'selected-weekdays'
		? pattern
		: 'daily';
}

function parseSelectedWeekdays(formData: FormData): number[] {
	return [
		...new Set(
			formData
				.getAll('selectedWeekdays')
				.map((value) => Number(value))
				.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
		)
	].sort((left, right) => left - right);
}
