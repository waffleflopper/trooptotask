import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
import type {
	DutyRosterTemplate,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateCountReadModel,
	DutyRosterTemplateRunCorrection,
	DutyRosterTemplateSetupOptions,
	DutyRosterTemplateSettingsData,
	DutyRosterTemplateView
} from '$features/duty-roster/templates/dutyRosterTemplates';
import type {
	DutyRosterTemplateAcceptedSnapshot,
	DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';

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
}

export type DutyRosterWorkspaceViewTab = {
	id: DutyRosterTemplateView;
	label: string;
	note: string;
};

export type AcceptedFinalRow = DutyRosterTemplateAcceptedSnapshot['finalRows'][number];

export type AcceptedHistoryTableRow = {
	id: string;
	run: DutyRosterTemplateAcceptedRun;
	snapshot: DutyRosterTemplateAcceptedSnapshot;
	finalRow: AcceptedFinalRow;
	correction: DutyRosterTemplateRunCorrection | null;
	isInvalidated: boolean;
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
	generateAction: string;
	manualPreviewAction: string;
	acceptPreviewAction: string;
	applyPreviewAction: string;
	applyAcceptedRunAction: string;
	invalidateAcceptedRunAction: string;
	correctAcceptedRunAction: string;
	settingsAction: string;
	acceptedRuns: DutyRosterTemplateAcceptedRun[];
	setupPersonnel: DutyRosterTemplateSettingsData['personnel'];
	historyDetailRun: DutyRosterTemplateAcceptedRun | null;
	countReadModel: DutyRosterTemplateCountReadModel | null;
	latestHistoryRunId: string | null;
	baselineLocked: boolean;
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
	acceptedHistoryColumns: ColumnDef<AcceptedHistoryTableRow>[];
};

const VIEW_TABS: DutyRosterWorkspaceViewTab[] = [
	{ id: 'generate', label: 'Generate', note: 'Preview future DA6 runs' },
	{ id: 'history', label: 'History', note: 'Accepted runs will appear here' },
	{ id: 'settings', label: 'Settings', note: 'Template identity and setup' }
];

export const acceptedHistoryColumns: ColumnDef<AcceptedHistoryTableRow>[] = [
	{
		key: 'date',
		header: 'Date',
		value: (row) => row.finalRow.date
	},
	{
		key: 'assigned',
		header: 'Assigned',
		value: (row) => row.finalRow.finalDisplay?.lastName ?? 'Unfilled',
		searchValue: (row) =>
			row.finalRow.finalDisplay
				? `${row.finalRow.finalDisplay.rank} ${row.finalRow.finalDisplay.lastName}, ${row.finalRow.finalDisplay.firstName}`
				: 'Unfilled'
	},
	{
		key: 'source',
		header: 'Source',
		value: (row) => (row.correction ? 'Corrected' : row.finalRow.assignmentSource),
		sortable: false
	},
	{
		key: 'warnings',
		header: 'Warnings',
		value: (row) => row.finalRow.warnings.length,
		sortable: false
	},
	{
		key: 'review',
		header: 'Review State',
		value: (row) => (row.correction ? 'Corrected' : row.finalRow.reason || ''),
		sortable: false
	}
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
	const setupPersonnel = data.settings?.personnel ?? data.setupOptions?.personnel ?? [];
	const historyDetailRun = data.historyDetailRunId
		? (acceptedRuns.find((run) => run.id === data.historyDetailRunId) ?? null)
		: null;
	const countReadModel = data.countReadModel ?? null;
	const todayDate = dateOnlyLocal(now);
	const defaultDateRange = nextMonthRange(now);
	const generateStartDate = actionForm?.generateValues?.startDate ?? defaultDateRange.startDate;
	const generateEndDate = actionForm?.generateValues?.endDate ?? defaultDateRange.endDate;

	return {
		basePath,
		createAction,
		createWizardAction: `${basePath}/new?/createTemplate`,
		isNewTemplate,
		selectedTemplate,
		selectedView,
		actionForm,
		preview,
		generateAction: selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/generatePreview` : createAction,
		manualPreviewAction: selectedTemplate
			? `${basePath}/${selectedTemplate.slug}/generate?/manualPreviewSelection`
			: createAction,
		acceptPreviewAction: selectedTemplate
			? `${basePath}/${selectedTemplate.slug}/generate?/acceptPreview`
			: createAction,
		applyPreviewAction: selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/applyPreview` : createAction,
		applyAcceptedRunAction: selectedTemplate
			? `${basePath}/${selectedTemplate.slug}/history?/applyAcceptedRun`
			: createAction,
		invalidateAcceptedRunAction: selectedTemplate
			? `${basePath}/${selectedTemplate.slug}/history?/invalidateAcceptedRun`
			: createAction,
		correctAcceptedRunAction: selectedTemplate
			? `${basePath}/${selectedTemplate.slug}/history?/recordCorrection`
			: createAction,
		settingsAction: selectedTemplate ? `${basePath}/${selectedTemplate.slug}/settings?/updateSettings` : createAction,
		acceptedRuns,
		setupPersonnel,
		historyDetailRun,
		countReadModel,
		latestHistoryRunId: acceptedRuns[0]?.id ?? null,
		baselineLocked: acceptedRuns.length > 0,
		rankOptions: uniqueOptions(setupPersonnel.map((person) => person.rank)),
		groupOptions: uniqueGroupOptions(setupPersonnel),
		mosOptions: uniqueOptions(setupPersonnel.map((person) => person.mos).filter(Boolean)),
		dutyRoleOptions: uniqueOptions(setupPersonnel.map((person) => person.dutyRole).filter(Boolean)),
		viewTabs: VIEW_TABS,
		todayDate,
		defaultDateRange,
		generateStartDate,
		generateEndDate,
		canGenerate: generateStartDate >= todayDate && generateEndDate >= generateStartDate,
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

export function dateOnlyLocal(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function nextMonthRange(date: Date): { startDate: string; endDate: string } {
	const start = new Date(date.getFullYear(), date.getMonth() + 1, 1);
	const end = new Date(date.getFullYear(), date.getMonth() + 2, 0);
	return {
		startDate: dateOnlyLocal(start),
		endDate: dateOnlyLocal(end)
	};
}

export function optionItems(values: string[]): Array<{ value: string; label: string }> {
	return values.map((value) => ({ value, label: value }));
}

export function groupOptionItems(
	values: Array<{ id: string; label: string }>
): Array<{ value: string; label: string }> {
	return values.map((group) => ({ value: group.id, label: group.label }));
}

export function personnelOptionItems(
	personnel: DutyRosterTemplatePreview['selectionPersonnel'] | DutyRosterTemplateAcceptedSnapshot['selectionPersonnel'],
	excludeId?: string | null
): Array<{ value: string; label: string; description?: string }> {
	return personnel
		.filter((person) => person.id !== excludeId && !person.archivedAt)
		.map((person) => ({
			value: person.id,
			label: `${person.rank} ${person.lastName}, ${person.firstName}`,
			description: person.groupName
		}));
}

export function calendarActionState(run: DutyRosterTemplateAcceptedRun): 'apply' | 'applied' | 'reapply' {
	if (!run.appliedAt) return 'apply';
	if (run.calendarAssignmentsEdited) return 'reapply';
	return 'applied';
}

export function issueLabel(warnings: Array<{ message: string }>): string {
	if (warnings.length === 0) return 'Clear';
	return warnings.length === 1 ? 'Review' : `${warnings.length} issues`;
}

export function issueTitle(warnings: Array<{ message: string }>): string {
	return warnings.length > 0 ? warnings.map((warning) => warning.message).join(' ') : 'No issue flagged.';
}

export function correctionKey(runId: string, date: string): string {
	return `${runId}:${date}`;
}

export function previewAssignee(preview: DutyRosterTemplatePreview, assigneeId: string | null) {
	return preview.selectionPersonnel.find((person) => person.id === assigneeId) ?? null;
}

export function previewFormValue(preview: DutyRosterTemplatePreview): string {
	return JSON.stringify(preview);
}

export function acceptedSnapshot(run: DutyRosterTemplateAcceptedRun): DutyRosterTemplateAcceptedSnapshot {
	return run.snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
}

export function latestCorrectionForDate(run: DutyRosterTemplateAcceptedRun, date: string) {
	return run.corrections.filter((correction) => correction.runRowDate === date).at(-1) ?? null;
}

export function correctionPersonName(
	display: DutyRosterTemplateRunCorrection['replacementDisplay'],
	fallbackId: string
): string {
	return display ? `${display.rank} ${display.lastName}, ${display.firstName}` : fallbackId;
}

export function da6CellClasses(
	cell: DutyRosterTemplatePreview['da6']['rows'][number]['cells'][number],
	column?: DutyRosterTemplatePreview['da6']['columns'][number]
): string {
	const classes: string[] = [];
	if (cell.assigned) classes.push('cell-duty');
	if (cell.da6Code === 'A') classes.push('cell-a');
	if (cell.da6Code === 'D') classes.push('cell-d');
	if (cell.da6Code === 'U') classes.push('cell-u');
	if (column?.sequenceKind === 'weekend') classes.push('cell-weekend');
	return classes.join(' ');
}

export function previewCellDisplay(cell: DutyRosterTemplatePreview['da6']['rows'][number]['cells'][number]): string {
	if (cell.da6Code === 'A') {
		return 'A';
	}
	if (cell.da6Code === 'D' || cell.da6Code === 'U') {
		return `${cell.da6Code}${cell.sequenceNumber ?? ''}`;
	}
	return cell.sequenceNumber === null ? '' : String(cell.sequenceNumber);
}

export function acceptedCellDisplay(
	cell: DutyRosterTemplateAcceptedSnapshot['da6']['rows'][number]['cells'][number]
): string {
	return previewCellDisplay(cell);
}

export function acceptedHistoryRows(
	run: DutyRosterTemplateAcceptedRun,
	snapshot: DutyRosterTemplateAcceptedSnapshot,
	isInvalidated: boolean
): AcceptedHistoryTableRow[] {
	return snapshot.finalRows.map((row) => ({
		id: `${run.id}:${row.date}`,
		run,
		snapshot,
		finalRow: row,
		correction: latestCorrectionForDate(run, row.date),
		isInvalidated
	}));
}
