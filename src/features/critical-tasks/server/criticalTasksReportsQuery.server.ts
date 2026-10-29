import type { CriticalTasksReportContext } from './criticalTasksReadPorts.server';
import type { CriticalTasksSettings, IctTask, PersonnelIctCompletion } from '../contracts';
import type { Group, GroupPersistence } from '$features/personnel/contracts';
import { loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { Personnel } from '$features/personnel/contracts';
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
import { fetchCriticalTasksSettings } from './criticalTasksSettingsRead.server';
import type {
	CriticalTasksReportInput,
	CriticalTasksReportsPageModel,
	CriticalTasksMatrixExportInput,
	CriticalTasksWorkbookExport
} from '../contracts';
import { writeWorkbookBuffer } from '$lib/utils/workbook';
import { formatDate } from '$lib/utils/dates';
import { resolveCriticalTasksAsOfDate } from '../utils/ictReadinessSnapshot';

type CriticalTasksReportQueryContext = CriticalTasksReportContext & {
	readonly groups: Pick<GroupPersistence, 'listCatalog'>;
};

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
	const completions = await ctx.criticalTaskCompletions.listReportHistory({
		personnelIds: filteredPersonnel.map((person) => person.id),
		taskIds: source.tasks.map((task) => task.id)
	});

	return buildIctReportDashboard({
		personnel: filteredPersonnel,
		tasks: source.tasks,
		completions,
		settings: source.settings,
		asOf: input.asOf,
		timeZone: input.timeZone
	});
}

async function loadCriticalTasksReportSource(ctx: CriticalTasksReportQueryContext): Promise<CriticalTasksReportSource> {
	if (!ctx.personnelCriticalTasksRoster) throw new Error('Personnel Critical Tasks roster provider unavailable');
	const [personnel, groups, tasks, settings, rankCatalog] = await Promise.all([
		ctx.personnelCriticalTasksRoster.listActiveForReadiness(ctx.auth),
		ctx.groups.listCatalog(),
		ctx.criticalTaskLibrary.listCatalog(),
		fetchCriticalTasksSettings(ctx),
		loadOrganizationRankCatalog(
			{ auth: ctx.auth, rankCatalog: ctx.rankCatalog },
			{ authorization: 'critical-tasks-readiness' }
		)
	]);

	return {
		personnel,
		groups,
		tasks,
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

export async function fetchCriticalTasksReportDashboard(
	ctx: CriticalTasksReportQueryContext,
	input: CriticalTasksReportInput = {}
): Promise<IctReportDashboard> {
	const source = await loadCriticalTasksReportSource(ctx);
	return buildDashboardFromSource(ctx, source, input);
}

export async function fetchCriticalTasksDashboardSummary(
	ctx: CriticalTasksReportQueryContext,
	input: CriticalTasksReportInput = {}
): Promise<IctReportDashboardSummary> {
	const source = await loadCriticalTasksReportSource(ctx);
	const filteredPersonnel = filterIctReportPersonnel(source.personnel, input.filters ?? {});
	const completions = await ctx.criticalTaskCompletions.listReportHistory({
		personnelIds: filteredPersonnel.map((person) => person.id),
		taskIds: source.tasks.map((task) => task.id)
	});

	return buildIctReportDashboardSummary({
		personnel: filteredPersonnel,
		tasks: source.tasks,
		completions,
		settings: source.settings,
		asOf: input.asOf,
		timeZone: input.timeZone
	});
}

export async function fetchCriticalTasksReportsPageModel(
	ctx: CriticalTasksReportQueryContext,
	input: CriticalTasksReportInput = {}
): Promise<CriticalTasksReportsPageModel> {
	const source = await loadCriticalTasksReportSource(ctx);

	return {
		initialDashboard: await buildDashboardFromSource(ctx, source, input),
		reportScope: buildCriticalTasksReportScope(source)
	};
}

export async function generateCriticalTasksReportWorkbookExport(
	ctx: CriticalTasksReportQueryContext,
	input: CriticalTasksReportInput = {}
): Promise<CriticalTasksWorkbookExport> {
	const source = await loadCriticalTasksReportSource(ctx);
	const dashboard = await buildDashboardFromSource(ctx, source, input);
	const workbook = await buildCriticalTasksReportWorkbook(dashboard, source.groups, source.personnel);
	const date = formatDate(resolveCriticalTasksAsOfDate(input.asOf));
	return {
		buffer: await writeWorkbookBuffer(workbook),
		filename: `critical-task-report-${date}.xlsx`
	};
}

export async function generateCriticalTasksMatrixWorkbookExport(
	ctx: CriticalTasksReportQueryContext,
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
	const workbook = await buildCriticalTasksMatrixWorkbook(matrix, source.groups);
	const date = formatDate(resolveCriticalTasksAsOfDate(input.asOf));
	return {
		buffer: await writeWorkbookBuffer(workbook),
		filename: `critical-task-matrix-${date}.xlsx`
	};
}
