import type { CriticalTasksReportContext } from './criticalTasksReadPorts.server';
import type { CriticalTasksSettings, IctTask, PersonnelIctCompletion } from '../contracts';
import type { Group } from '$features/personnel/contracts';
import { listGroupCatalog, loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { Personnel } from '$lib/types';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import { observedRankCodesForOptions } from '$features/personnel/contracts';
import { buildCriticalTasksMatrix, matchesCriticalTasksPersonnelSearch } from '../utils/criticalTasksMatrix';
import { buildCriticalTasksMatrixWorkbook, buildCriticalTasksReportWorkbook } from '../utils/ictWorkbookExport';
import {
	buildIctReportDashboard,
	buildIctReportDashboardSummary,
	filterIctReportPersonnel,
	type IctReportDashboard,
	type IctReportDashboardSummary,
	type IctReportScope
} from '../utils/ictReports';
import { getActiveIctTasksForLibrary } from '../utils/ictTaskLibrary';
import { IctTaskEntity } from './ictTaskEntity.server';
import { PersonnelIctCompletionEntity } from './personnelIctCompletionEntity.server';
import { fetchCriticalTasksSettings } from './criticalTasksSettingsRead.server';
import type {
	CriticalTasksReportInput,
	CriticalTasksReportsPageModel,
	CriticalTasksMatrixExportInput,
	CriticalTasksWorkbookExport
} from '../contracts';
import { writeWorkbookBuffer } from '$lib/utils/workbook';

interface CriticalTasksReportSource {
	personnel: Personnel[];
	groups: Group[];
	tasks: IctTask[];
	settings: CriticalTasksSettings;
	rankCatalog: RankCatalogEntry[];
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
			ranks: observedRankCodesForOptions({
				rankCatalog: source.rankCatalog.length > 0 ? source.rankCatalog : undefined,
				observedRanks: source.personnel.map((person) => person.rank)
			}),
			roles: uniqueSorted(source.personnel.map((person) => person.clinicRole))
		}
	};
}

async function buildDashboardFromSource(
	ctx: CriticalTasksReportContext,
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

async function loadCriticalTasksReportSource(ctx: CriticalTasksReportContext): Promise<CriticalTasksReportSource> {
	const orgId = ctx.auth.orgId;
	if (!ctx.personnelCriticalTasksRoster) throw new Error('Personnel Critical Tasks roster provider unavailable');
	const [personnel, groups, taskRows, settings, rankCatalog] = await Promise.all([
		ctx.personnelCriticalTasksRoster.listActiveForReadiness(ctx.auth),
		listGroupCatalog(ctx),
		ctx.store.findMany<Record<string, unknown>>('ict_tasks', orgId, undefined, {
			isNull: { archived_at: true },
			orderBy: [
				{ column: 'sort_order', ascending: true },
				{ column: 'task_code', ascending: true }
			]
		}),
		fetchCriticalTasksSettings(ctx),
		loadOrganizationRankCatalog({ auth: ctx.auth, store: ctx.store }, { authorization: 'critical-tasks-readiness' })
	]);

	return {
		personnel,
		groups,
		tasks: IctTaskEntity.fromDbArray(taskRows),
		settings,
		rankCatalog
	};
}

async function loadLatestCompletions(
	ctx: CriticalTasksReportContext,
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

	return completionRows;
}

async function loadReportCompletions(
	ctx: CriticalTasksReportContext,
	personnelIds: string[],
	taskIds: string[]
): Promise<PersonnelIctCompletion[]> {
	if (personnelIds.length === 0 || taskIds.length === 0) {
		return [];
	}

	const people = [...new Set(personnelIds)];
	const tasks = [...new Set(taskIds)];
	const completionRows: Record<string, unknown>[] = [];
	let pending: Array<Promise<Record<string, unknown>[]>> = [];
	// Bound both UUID filters and concurrent history reads. Each lookup retains
	// the store's pagination; reports need every historical date, not only latest.
	for (let personIndex = 0; personIndex < people.length; personIndex += 50) {
		for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 50) {
			pending.push(
				ctx.store.findMany<Record<string, unknown>>('personnel_ict_completions', ctx.auth.orgId, undefined, {
					inFilters: {
						personnel_id: people.slice(personIndex, personIndex + 50),
						ict_task_id: tasks.slice(taskIndex, taskIndex + 50)
					},
					// Reports need every date; make offset pages stable even for tied captures.
					orderBy: [{ column: 'id', ascending: true }]
				})
			);
			if (pending.length === 4) {
				for (const rows of await Promise.all(pending)) {
					for (const row of rows) completionRows.push(row);
				}
				pending = [];
			}
		}
	}
	for (const rows of await Promise.all(pending)) {
		for (const row of rows) completionRows.push(row);
	}

	return PersonnelIctCompletionEntity.fromDbArray(completionRows);
}

export async function fetchCriticalTasksReportDashboard(
	ctx: CriticalTasksReportContext,
	input: CriticalTasksReportInput = {}
): Promise<IctReportDashboard> {
	const source = await loadCriticalTasksReportSource(ctx);
	return buildDashboardFromSource(ctx, source, input);
}

export async function fetchCriticalTasksDashboardSummary(
	ctx: CriticalTasksReportContext,
	input: CriticalTasksReportInput = {}
): Promise<IctReportDashboardSummary> {
	const source = await loadCriticalTasksReportSource(ctx);
	const filteredPersonnel = filterIctReportPersonnel(source.personnel, input.filters ?? {});
	const completions = await loadReportCompletions(
		ctx,
		filteredPersonnel.map((person) => person.id),
		source.tasks.map((task) => task.id)
	);

	return buildIctReportDashboardSummary({
		personnel: filteredPersonnel,
		tasks: source.tasks,
		completions,
		settings: source.settings,
		asOf: input.asOf
	});
}

export async function fetchCriticalTasksReportsPageModel(
	ctx: CriticalTasksReportContext,
	input: CriticalTasksReportInput = {}
): Promise<CriticalTasksReportsPageModel> {
	const source = await loadCriticalTasksReportSource(ctx);

	return {
		initialDashboard: await buildDashboardFromSource(ctx, source, input),
		reportScope: buildCriticalTasksReportScope(source)
	};
}

export async function generateCriticalTasksReportWorkbookExport(
	ctx: CriticalTasksReportContext,
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
	ctx: CriticalTasksReportContext,
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
		selectedGroupFilter: input.selectedGroupFilter ?? '',
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
