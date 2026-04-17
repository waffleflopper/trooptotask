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
	buildIctReportDashboard,
	buildIctReportSummary,
	filterIctReportPersonnel,
	type IctReportDashboard,
	type IctReportFilters,
	type IctReportSummary
} from '$features/critical-tasks/utils/ictReports';
import { GroupEntity } from '$lib/server/entities/group';
import { IctTaskEntity } from '$lib/server/entities/ictTask';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';

export interface CriticalTasksReportInput {
	filters?: IctReportFilters;
	asOf?: string | Date;
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

function escapeCsv(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}

	return value;
}

function renderCell(completion: PersonnelIctCompletion | undefined, status: string): string {
	switch (status) {
		case 'current':
			return `Current${completion ? ` (${completion.completedAt})` : ''}`;
		case 'expiring-soon':
			return `Expiring Soon${completion ? ` (${completion.completedAt})` : ''}`;
		case 'expired':
			return `Expired${completion ? ` (${completion.completedAt})` : ''}`;
		default:
			return 'Not Recorded';
	}
}

function formatDelta(delta: number): string {
	if (delta > 0) return `+${delta} pts vs 30d`;
	if (delta < 0) return `${delta} pts vs 30d`;
	return '0 pts vs 30d';
}

function formatDaysSinceLastIctUpdate(days: number | null): string {
	if (days === null) return 'No ICT update';
	if (days === 1) return '1 day since update';
	return `${days} days since update`;
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

export async function generateCriticalTasksReportCsv(
	ctx: QueryPorts,
	input: CriticalTasksReportInput = {}
): Promise<string> {
	const dashboard = await fetchCriticalTasksReportDashboard(ctx, input);
	const { overallReadiness, soldiersBelow70, tasksExpiringSoon, tasksBelowThreshold } = dashboard.kpis;
	const lines = ['Section,Metric,Value,Subtitle'];
	for (const row of dashboard.atRiskSoldiers.rows) {
		lines.push(
			[
				'At-Risk Soldiers',
				row.soldierName,
				`${row.readinessPercent}%`,
				`${row.rank} ${row.mos}; ${row.groupName}; ${row.tasksExpiringSoonCount} expiring <=30d; ${formatDaysSinceLastIctUpdate(row.daysSinceLastIctUpdate)}`
			]
				.map(escapeCsv)
				.join(',')
		);
	}
	lines.push(
		['Summary', 'Overall Readiness', `${overallReadiness.percent}%`, formatDelta(overallReadiness.deltaPercent)]
			.map(escapeCsv)
			.join(',')
	);
	lines.push(
		['Summary', 'Soldiers Below 70%', String(soldiersBelow70.count), `${soldiersBelow70.totalAssigned} assigned`]
			.map(escapeCsv)
			.join(',')
	);
	lines.push(
		[
			'Summary',
			'Tasks Expiring <=30d',
			String(tasksExpiringSoon.count),
			`${tasksExpiringSoon.affectedSoldiers} Soldiers affected`
		]
			.map(escapeCsv)
			.join(',')
	);
	lines.push(
		[
			'Summary',
			'Tasks Below Threshold',
			String(tasksBelowThreshold.count),
			`Below ${tasksBelowThreshold.thresholdPercent}% unit completion`
		]
			.map(escapeCsv)
			.join(',')
	);
	for (const row of dashboard.tasksBelowThreshold.rows) {
		lines.push(
			[
				'Tasks Below Unit Threshold',
				`${row.taskCode} ${row.taskName}`,
				`${row.percentComplete}%`,
				`${row.soldierGapCount} Soldiers need it`
			]
				.map(escapeCsv)
				.join(',')
		);
	}

	return lines.join('\n');
}

export async function generateCriticalTasksMatrixCsv(
	ctx: QueryPorts,
	input: CriticalTasksMatrixExportInput = {}
): Promise<string> {
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

	const headers = [
		'Name',
		'Rank',
		'MOS',
		'Role',
		'Group',
		...matrix.tasks.map((task) => `${task.taskCode} ${task.title}`)
	];
	const lines = [headers.map(escapeCsv).join(',')];
	for (const row of matrix.alphabeticalRows) {
		const values = [
			`${row.person.lastName}, ${row.person.firstName}`,
			row.person.rank,
			row.person.mos,
			row.person.clinicRole,
			row.person.groupName,
			...row.cells.map((cell) => (cell.applicable ? renderCell(cell.completion, cell.statusInfo.status) : ''))
		];
		lines.push(values.map((value) => escapeCsv(value)).join(','));
	}

	return lines.join('\n');
}
