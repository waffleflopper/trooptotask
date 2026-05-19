import type { QueryPorts } from '$lib/server/core/ports';
import type {
	CriticalTasksSettings,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
import {
	buildCriticalTasksMatrix,
	matchesCriticalTasksPersonnelSearch
} from '$features/critical-tasks/utils/criticalTasksMatrix';
import {
	buildCriticalTasksMatrixWorkbook,
	buildCriticalTasksReportWorkbook
} from '$features/critical-tasks/utils/ictWorkbookExport';
import {
	buildIctReportDashboard,
	buildIctReportSummary,
	filterIctReportPersonnel,
	type IctReportDashboard,
	type IctReportFilters,
	type IctReportScope,
	type IctReportSummary
} from '$features/critical-tasks/utils/ictReports';
import { getActiveIctTasksForLibrary } from '$features/critical-tasks/utils/ictTaskLibrary';
import { GroupEntity } from '$lib/server/entities/group';
import { IctTaskEntity } from '$lib/server/entities/ictTask';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { writeWorkbookBuffer } from '$lib/export/workbook';

export interface CriticalTasksReportInput {
	filters?: IctReportFilters;
	asOf?: string | Date;
}

export interface CriticalTasksReportsPageModel {
	initialDashboard: IctReportDashboard;
	reportScope: IctReportScope;
}

export interface CriticalTasksMatrixExportInput {
	selectedGroupId?: string;
	gapsOnly?: boolean;
	search?: string;
	asOf?: string | Date;
}

interface CriticalTasksReportSource {
	personnel: Personnel[];
	groups: Group[];
	tasks: IctTask[];
	settings: CriticalTasksSettings;
}

interface OrgSettingsRow {
	critical_tasks_default_expiration_months?: number | null;
	critical_tasks_expiring_soon_warning_days?: number | null;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort(
		(a, b) => a.localeCompare(b)
	);
}

function buildCriticalTasksReportScope(source: CriticalTasksReportSource): IctReportScope {
	const activeTasks = getActiveIctTasksForLibrary(source.tasks);

	return {
		personnel: source.personnel.map((person) => ({
			id: person.id,
			groupId: person.groupId,
			mos: person.mos,
			rank: person.rank,
			dutyRole: person.clinicRole
		})),
		groups: source.groups.map((group) => ({ id: group.id, name: group.name })),
		hasActiveTasks: activeTasks.length > 0,
		activeTaskCount: activeTasks.length,
		totalPersonnelCount: source.personnel.length,
		filterOptions: {
			mos: uniqueSorted(source.personnel.map((person) => person.mos)),
			ranks: uniqueSorted(source.personnel.map((person) => person.rank)),
			roles: uniqueSorted(source.personnel.map((person) => person.clinicRole))
		}
	};
}

async function buildDashboardFromSource(
	ctx: QueryPorts,
	source: CriticalTasksReportSource,
	input: CriticalTasksReportInput = {}
): Promise<IctReportDashboard> {
	const filteredPersonnel = filterIctReportPersonnel(source.personnel, input.filters ?? {});
	const completions = await loadReportCompletions(
		ctx,
		filteredPersonnel.map((person) => person.id),
		source.tasks.map((task) => task.id)
	);

	return buildIctReportDashboard({
		personnel: filteredPersonnel,
		tasks: source.tasks,
		completions,
		settings: source.settings,
		asOf: input.asOf
	});
}

async function loadCriticalTasksReportSource(ctx: QueryPorts): Promise<CriticalTasksReportSource> {
	const orgId = ctx.auth.orgId;
	const [personnelRows, groupRows, taskRows, settingsRow] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [{ column: 'last_name', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('ict_tasks', orgId, undefined, {
			isNull: { archived_at: true },
			orderBy: [
				{ column: 'sort_order', ascending: true },
				{ column: 'task_code', ascending: true }
			]
		}),
		ctx.store.findOne<OrgSettingsRow>('organizations', orgId, { id: orgId })
	]);

	return {
		personnel: PersonnelEntity.fromDbArray(personnelRows),
		groups: GroupEntity.fromDbArray(groupRows),
		tasks: IctTaskEntity.fromDbArray(taskRows),
		settings: normalizeCriticalTasksSettings({
			defaultExpirationMonths: settingsRow?.critical_tasks_default_expiration_months ?? null,
			expiringSoonWarningDays: settingsRow?.critical_tasks_expiring_soon_warning_days ?? null
		})
	};
}

async function loadLatestCompletions(
	ctx: QueryPorts,
	personnelIds: string[],
	taskIds: string[]
): Promise<PersonnelIctCompletion[]> {
	if (personnelIds.length === 0 || taskIds.length === 0) {
		return [];
	}

	const completionRows = await ctx.criticalTasksReadModel.findLatestCompletions(ctx.auth.orgId, {
		personnelIds,
		taskIds
	});

	return PersonnelIctCompletionEntity.fromDbArray(completionRows);
}

async function loadReportCompletions(
	ctx: QueryPorts,
	personnelIds: string[],
	taskIds: string[]
): Promise<PersonnelIctCompletion[]> {
	if (personnelIds.length === 0 || taskIds.length === 0) {
		return [];
	}

	const completionRows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel_ict_completions',
		ctx.auth.orgId,
		undefined,
		{
			inFilters: {
				personnel_id: personnelIds,
				ict_task_id: taskIds
			}
		}
	);

	return PersonnelIctCompletionEntity.fromDbArray(completionRows);
}

export async function fetchCriticalTasksReportDashboard(
	ctx: QueryPorts,
	input: CriticalTasksReportInput = {}
): Promise<IctReportDashboard> {
	const source = await loadCriticalTasksReportSource(ctx);
	return buildDashboardFromSource(ctx, source, input);
}

export async function fetchCriticalTasksReportsPageModel(
	ctx: QueryPorts,
	input: CriticalTasksReportInput = {}
): Promise<CriticalTasksReportsPageModel> {
	const source = await loadCriticalTasksReportSource(ctx);

	return {
		initialDashboard: await buildDashboardFromSource(ctx, source, input),
		reportScope: buildCriticalTasksReportScope(source)
	};
}

export async function fetchCriticalTasksReportSummary(
	ctx: QueryPorts,
	input: CriticalTasksReportInput = {}
): Promise<IctReportSummary> {
	const source = await loadCriticalTasksReportSource(ctx);
	const filteredPersonnel = filterIctReportPersonnel(source.personnel, input.filters ?? {});
	const personnelIds = filteredPersonnel.map((person) => person.id);
	const taskIds = source.tasks.map((task) => task.id);
	const [completions, completionTrend] = await Promise.all([
		loadLatestCompletions(ctx, personnelIds, taskIds),
		ctx.criticalTasksReadModel.findCompletionTrend(ctx.auth.orgId, {
			personnelIds,
			taskIds
		})
	]);
	return buildIctReportSummary({
		personnel: filteredPersonnel,
		tasks: source.tasks,
		completions,
		completionTrend,
		settings: source.settings,
		asOf: input.asOf
	});
}

export interface CriticalTasksWorkbookExport {
	buffer: ArrayBuffer;
	filename: string;
}

export async function generateCriticalTasksReportWorkbookExport(
	ctx: QueryPorts,
	input: CriticalTasksReportInput = {}
): Promise<CriticalTasksWorkbookExport> {
	const dashboard = await fetchCriticalTasksReportDashboard(ctx, input);
	const workbook = await buildCriticalTasksReportWorkbook(dashboard);
	const date = new Date().toISOString().split('T')[0];
	return {
		buffer: await writeWorkbookBuffer(workbook),
		filename: `critical-task-report-${date}.xlsx`
	};
}

export async function generateCriticalTasksMatrixWorkbookExport(
	ctx: QueryPorts,
	input: CriticalTasksMatrixExportInput = {}
): Promise<CriticalTasksWorkbookExport> {
	const source = await loadCriticalTasksReportSource(ctx);
	const search = input.search?.trim() ?? '';
	const filteredPersonnel = search
		? source.personnel.filter((person) => matchesCriticalTasksPersonnelSearch(person, search))
		: source.personnel;
	const completions = await loadLatestCompletions(
		ctx,
		filteredPersonnel.map((person) => person.id),
		source.tasks.map((task) => task.id)
	);
	const matrix = buildCriticalTasksMatrix({
		personnel: filteredPersonnel,
		tasks: source.tasks,
		completions,
		groups: source.groups,
		settings: source.settings,
		selectedGroupId: input.selectedGroupId ?? '',
		gapsOnly: input.gapsOnly ?? false,
		asOf: input.asOf,
		orgName: 'Unassigned'
	});
	const workbook = await buildCriticalTasksMatrixWorkbook(matrix);
	const date = new Date().toISOString().split('T')[0];
	return {
		buffer: await writeWorkbookBuffer(workbook),
		filename: `critical-task-matrix-${date}.xlsx`
	};
}
