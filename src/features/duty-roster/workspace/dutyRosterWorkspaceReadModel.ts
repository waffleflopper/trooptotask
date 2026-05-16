import type {
	DutyRosterTemplate,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateCountReadModel,
	DutyRosterTemplateSetupOptions,
	DutyRosterTemplateSettingsData,
	DutyRosterTemplateView
} from '$features/duty-roster/templates/dutyRosterTemplates';
import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import { dutyRosterTodayDate, nextDutyRosterMonthRange } from '$features/duty-roster/templates/dutyRosterDatePolicy';
import { ARMY_RANKS } from '$lib/types';
import { acceptedHistoryColumns } from './dutyRosterPreviewReview';

export type DutyRosterGenerationPattern = 'daily' | 'weekday-only' | 'weekend-only' | 'selected-weekdays';

export type DutyRosterWorkspaceActionForm = {
	error?: string;
	generateError?: string;
	manualError?: string;
	settingsError?: string;
	applyError?: string;
	invalidateError?: string;
	correctionError?: string;
	preview?: DutyRosterTemplatePreview;
	acceptedRun?: DutyRosterTemplateAcceptedRun;
	printAcceptedRun?: boolean;
	generateValues?: {
		startDate?: string;
		endDate?: string;
		pattern?: DutyRosterGenerationPattern;
		selectedWeekdays?: number[];
		skipHolidaysAndDonsas?: boolean;
	};
	values?: {
		name?: string;
		slug?: string;
		shortCode?: string;
		rankValues?: string[];
		groupIds?: string[];
		mosValues?: string[];
		dutyRoleValues?: string[];
		exemptPersonnelIds?: string[];
		manualBaselineCounts?: Record<string, string>;
	};
};

export interface DutyRosterWorkspaceData {
	orgId: string;
	orgName: string;
	templates: DutyRosterTemplate[];
	selectedTemplate?: DutyRosterTemplate | null;
	settings?: DutyRosterTemplateSettingsData | null;
	acceptedRuns?: DutyRosterTemplateAcceptedRun[];
	countReadModel?: DutyRosterTemplateCountReadModel | null;
	setupOptions?: DutyRosterTemplateSetupOptions | null;
	view?: DutyRosterTemplateView | 'new';
	historyDetailRunId?: string | null;
	historyDetailMode?: 'roster' | 'da6';
	historyPage?: DutyRosterHistoryPageInfo | null;
}

export type DutyRosterHistoryPageInfo = {
	page: number;
	pageSize: number;
	hasMore: boolean;
	nextPage: number | null;
	previousPage: number | null;
	latestRunId?: string | null;
};

export type DutyRosterWorkspaceViewTab = {
	id: DutyRosterTemplateView;
	label: string;
	note: string;
};

export type DutyRosterGenerateWorkspaceModel = {
	selectedTemplate: DutyRosterTemplate;
	actionForm: DutyRosterWorkspaceActionForm | null;
	preview: DutyRosterTemplatePreview | null;
	acceptedRuns: DutyRosterTemplateAcceptedRun[];
	generateAction: string;
	manualPreviewAction: string;
	acceptPreviewAction: string;
	applyPreviewAction: string;
	historyPath: string;
	countReadModel: DutyRosterTemplateCountReadModel | null;
	todayDate: string;
	generateStartDate: string;
	generateEndDate: string;
	generationPattern: DutyRosterGenerationPattern;
	selectedWeekdays: number[];
	skipHolidaysAndDonsas: boolean;
	canGenerate: boolean;
};

export type DutyRosterTemplateSettingsWorkspaceModel = {
	basePath: string;
	selectedTemplate: DutyRosterTemplate;
	actionForm: DutyRosterWorkspaceActionForm | null;
	settings: DutyRosterTemplateSettingsData | null;
	settingsAction: string;
	baselineLocked: boolean;
	acceptedRuns: DutyRosterTemplateAcceptedRun[];
	countReadModel: DutyRosterTemplateCountReadModel | null;
	rankOptions: string[];
	groupOptions: Array<{ id: string; label: string }>;
	mosOptions: string[];
	dutyRoleOptions: string[];
};

export type DutyRosterWorkspaceReadModel = {
	basePath: string;
	createAction: string;
	createWizardAction: string;
	isNewTemplate: boolean;
	selectedTemplate: DutyRosterTemplate | null;
	selectedView: DutyRosterTemplateView | 'new';
	actionForm: DutyRosterWorkspaceActionForm | null;
	preview: DutyRosterTemplatePreview | null;
	generateWorkspace: DutyRosterGenerateWorkspaceModel | null;
	settingsWorkspace: DutyRosterTemplateSettingsWorkspaceModel | null;
	generateAction: string;
	manualPreviewAction: string;
	acceptPreviewAction: string;
	applyPreviewAction: string;
	applyAcceptedRunAction: string;
	invalidateAcceptedRunAction: string;
	correctAcceptedRunAction: string;
	acceptedRuns: DutyRosterTemplateAcceptedRun[];
	historyPage: DutyRosterHistoryPageInfo | null;
	setupPersonnel: DutyRosterTemplateSettingsData['personnel'];
	historyDetailRun: DutyRosterTemplateAcceptedRun | null;
	countReadModel: DutyRosterTemplateCountReadModel | null;
	latestHistoryRunId: string | null;
	rankOptions: string[];
	groupOptions: Array<{ id: string; label: string }>;
	mosOptions: string[];
	dutyRoleOptions: string[];
	viewTabs: DutyRosterWorkspaceViewTab[];
	todayDate: string;
	defaultDateRange: { startDate: string; endDate: string };
	generateStartDate: string;
	generateEndDate: string;
	canGenerate: boolean;
	historyMode: 'list' | 'matrix';
	acceptedHistoryColumns: typeof acceptedHistoryColumns;
};

const VIEW_TABS: DutyRosterWorkspaceViewTab[] = [
	{ id: 'generate', label: 'Generate', note: 'Preview future DA6 runs' },
	{ id: 'history', label: 'History', note: 'Accepted runs will appear here' },
	{ id: 'settings', label: 'Settings', note: 'Template identity and setup' }
];

const DUTY_ROSTER_RANK_OPTIONS = [
	...[...ARMY_RANKS.officer].reverse(),
	...[...ARMY_RANKS.warrant].reverse(),
	...[...ARMY_RANKS.nco].reverse(),
	...[...ARMY_RANKS.enlisted].reverse(),
	...ARMY_RANKS.civilian
];

export function buildDutyRosterWorkspaceReadModel(
	data: DutyRosterWorkspaceData,
	form: unknown,
	now = new Date()
): DutyRosterWorkspaceReadModel {
	const basePath = `/org/${data.orgId}/duty-rosters`;
	const createAction = `${basePath}?/createTemplate`;
	const isNewTemplate = data.view === 'new';
	const selectedTemplate = isNewTemplate ? null : (data.selectedTemplate ?? null);
	const selectedView = data.view ?? 'generate';
	const actionForm = parseActionForm(form);
	const preview = selectedView === 'generate' ? (actionForm?.preview ?? null) : null;
	const acceptedRuns = data.acceptedRuns ?? [];
	const historyPage = data.historyPage ?? null;
	const setupPersonnel = data.settings?.personnel ?? data.setupOptions?.personnel ?? [];
	const historyDetailRun = data.historyDetailRunId
		? (acceptedRuns.find((run) => run.id === data.historyDetailRunId) ?? null)
		: null;
	const countReadModel = data.countReadModel ?? null;
	const todayDate = dutyRosterTodayDate(now);
	const defaultDateRange = nextDutyRosterMonthRange(now);
	const generateStartDate = actionForm?.generateValues?.startDate ?? defaultDateRange.startDate;
	const generateEndDate = actionForm?.generateValues?.endDate ?? defaultDateRange.endDate;
	const generationPattern = actionForm?.generateValues?.pattern ?? 'daily';
	const selectedWeekdays = normalizeSelectedWeekdays(actionForm?.generateValues?.selectedWeekdays ?? [1, 2, 3, 4, 5]);
	const skipHolidaysAndDonsas = actionForm?.generateValues?.skipHolidaysAndDonsas ?? false;
	const generateAction = selectedTemplate
		? `${basePath}/${selectedTemplate.slug}/generate?/generatePreview`
		: createAction;
	const manualPreviewAction = selectedTemplate
		? `${basePath}/${selectedTemplate.slug}/generate?/manualPreviewSelection`
		: createAction;
	const acceptPreviewAction = selectedTemplate
		? `${basePath}/${selectedTemplate.slug}/generate?/acceptPreview`
		: createAction;
	const applyPreviewAction = selectedTemplate
		? `${basePath}/${selectedTemplate.slug}/generate?/applyPreview`
		: createAction;
	const canGenerate =
		generateStartDate >= todayDate &&
		generateEndDate >= generateStartDate &&
		(generationPattern !== 'selected-weekdays' || selectedWeekdays.length > 0);
	const generateWorkspace = selectedTemplate
		? {
				selectedTemplate,
				actionForm,
				preview,
				acceptedRuns,
				generateAction,
				manualPreviewAction,
				acceptPreviewAction,
				applyPreviewAction,
				historyPath: `${basePath}/${selectedTemplate.slug}/history`,
				countReadModel,
				todayDate,
				generateStartDate,
				generateEndDate,
				generationPattern,
				selectedWeekdays,
				skipHolidaysAndDonsas,
				canGenerate
			}
		: null;
	const settingsAction = selectedTemplate
		? `${basePath}/${selectedTemplate.slug}/settings?/updateSettings`
		: createAction;
	const rankOptions = DUTY_ROSTER_RANK_OPTIONS;
	const groupOptions = uniqueGroupOptions(setupPersonnel);
	const mosOptions = uniqueOptions(setupPersonnel.map((person) => person.mos).filter(Boolean));
	const dutyRoleOptions = uniqueOptions(setupPersonnel.map((person) => person.dutyRole).filter(Boolean));
	const baselineLocked = acceptedRuns.some((run) => run.status === 'accepted');
	const settingsWorkspace = selectedTemplate
		? {
				basePath,
				selectedTemplate,
				actionForm,
				settings: data.settings ?? null,
				settingsAction,
				baselineLocked,
				acceptedRuns,
				countReadModel,
				rankOptions,
				groupOptions,
				mosOptions,
				dutyRoleOptions
			}
		: null;

	return {
		basePath,
		createAction,
		createWizardAction: `${basePath}/new?/createTemplate`,
		isNewTemplate,
		selectedTemplate,
		selectedView,
		actionForm,
		preview,
		generateWorkspace,
		settingsWorkspace,
		generateAction,
		manualPreviewAction,
		acceptPreviewAction,
		applyPreviewAction,
		applyAcceptedRunAction: selectedTemplate
			? `${basePath}/${selectedTemplate.slug}/history?/applyAcceptedRun`
			: createAction,
		invalidateAcceptedRunAction: selectedTemplate
			? `${basePath}/${selectedTemplate.slug}/history?/invalidateAcceptedRun`
			: createAction,
		correctAcceptedRunAction: selectedTemplate
			? `${basePath}/${selectedTemplate.slug}/history?/recordCorrection`
			: createAction,
		acceptedRuns,
		historyPage,
		setupPersonnel,
		historyDetailRun,
		countReadModel,
		latestHistoryRunId: historyPage?.latestRunId ?? acceptedRuns[0]?.id ?? null,
		rankOptions,
		groupOptions,
		mosOptions,
		dutyRoleOptions,
		viewTabs: VIEW_TABS,
		todayDate,
		defaultDateRange,
		generateStartDate,
		generateEndDate,
		canGenerate,
		historyMode: data.historyDetailMode === 'da6' ? 'matrix' : 'list',
		acceptedHistoryColumns
	};
}

export function parseActionForm(form: unknown): DutyRosterWorkspaceActionForm | null {
	return form && typeof form === 'object' ? (form as DutyRosterWorkspaceActionForm) : null;
}

export function uniqueOptions(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function uniqueGroupOptions(
	personnel: DutyRosterTemplateSettingsData['personnel']
): Array<{ id: string; label: string }> {
	const groups: Array<{ id: string; label: string }> = [];
	for (const person of personnel) {
		if (person.groupId && !groups.some((group) => group.id === person.groupId)) {
			groups.push({ id: person.groupId, label: person.groupName || 'Unassigned Group' });
		}
	}

	return groups.sort((a, b) => a.label.localeCompare(b.label));
}

export function optionItems(values: string[]): Array<{ value: string; label: string }> {
	return values.map((value) => ({ value, label: value }));
}

export function groupOptionItems(
	values: Array<{ id: string; label: string }>
): Array<{ value: string; label: string }> {
	return values.map((group) => ({ value: group.id, label: group.label }));
}

function normalizeSelectedWeekdays(values: number[] | undefined): number[] {
	return [...new Set((values ?? []).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))].sort(
		(left, right) => left - right
	);
}
