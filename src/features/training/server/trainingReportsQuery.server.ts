import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import { formatToday } from '$lib/utils/dates';
import { writeWorkbookBuffer } from '$lib/utils/workbook';
import type { OrganizationSettingsReader } from '$features/organization/contracts';
import type { Personnel, PersonnelTrainingRosterPort } from '$features/personnel/contracts';
import { observedRankCodesForOptions } from '$features/personnel/contracts';
import { listGroupCatalog, loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type {
	TrainingBriefingDetail,
	TrainingBriefingDetailInput,
	TrainingBriefingFilterOptions,
	TrainingBriefingReportData,
	TrainingBriefingReportInput,
	TrainingReportWorkbookExport,
	TrainingType
} from '../contracts';
import type { TrainingCatalogReadStore } from './trainingCatalogPorts.server';
import type { TrainingCompletionReadContext } from './trainingCompletionPorts.server';
import { listTrainingCompletions } from './trainingCompletionRead.server';
import { listTrainingTypes, listTrainingViews } from './trainingCatalogRead.server';
import { buildPivotTableFromMatrix, buildTrainingReportMatrix, filterPersonnel } from '../utils/reportCalculations';
import { buildTrainingBriefing, matchBriefingRequirements } from '../utils/trainingBriefing';
import type { TrainingBriefingInput } from '../utils/trainingBriefing.types';
import { buildTrainingReportWorkbook } from '../utils/trainingReportWorkbook';
import { filterColumnsByView } from '../utils/viewFiltering';

type TrainingReportReadContext = Omit<TrainingCompletionReadContext, 'store'> & {
	readonly store: TrainingCatalogReadStore & Parameters<typeof loadOrganizationRankCatalog>[0]['store'];
	readonly personnelTrainingRoster?: Pick<PersonnelTrainingRosterPort, 'listActiveForReports'>;
	readonly organizationSettings: Pick<OrganizationSettingsReader, 'findTrainingBriefingContext'>;
};

interface BriefingSource {
	input: TrainingBriefingReportInput;
	organizationName: string;
	filterOptions: TrainingBriefingFilterOptions;
	briefingInput: TrainingBriefingInput;
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function pick(selected: string[], available: string[]): string[] {
	const chosen = new Set(selected);
	return available.filter((value) => chosen.has(value));
}

async function loadBriefingSource(
	ctx: TrainingReportReadContext,
	request: TrainingBriefingReportInput
): Promise<BriefingSource> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.training.viewRecords, { kind: 'unscoped' }, 'training_record');
	if (!ctx.personnelTrainingRoster) throw new Error('Personnel Training roster provider unavailable');
	const orgId = ctx.auth.orgId;

	const [personnel, types, views, records, rankCatalog, groups, organization] = await Promise.all([
		ctx.personnelTrainingRoster.listActiveForReports(ctx.auth),
		listTrainingTypes(ctx.store, orgId),
		listTrainingViews(ctx.store, orgId),
		listTrainingCompletions(ctx),
		loadOrganizationRankCatalog({ auth: ctx.auth, store: ctx.store }, { authorization: 'training-records' }),
		listGroupCatalog(ctx),
		ctx.organizationSettings.findTrainingBriefingContext(orgId)
	]);
	if (!organization) fail(404, 'Organization not found');

	const view = views.find((candidate) => candidate.id === request.viewId) ?? null;
	const columns = filterColumnsByView(types, view).filter((type) => !type.isOptional);
	const group = groups.find((candidate) => candidate.id === request.groupId) ?? null;
	const filterOptions: TrainingBriefingFilterOptions = {
		views: views.map(({ id, name }) => ({ id, name })),
		groups: groups.map(({ id, name }) => ({ id, name })),
		ranks: observedRankCodesForOptions({
			rankCatalog: rankCatalog.length > 0 ? rankCatalog : undefined,
			observedRanks: personnel.map((person) => person.rank)
		}),
		mos: uniqueSorted(personnel.map((person) => person.mos)),
		roles: uniqueSorted(personnel.map((person) => person.clinicRole)),
		types: columns.map(({ id, name }) => ({ id, name }))
	};
	const input: TrainingBriefingReportInput = {
		viewId: view?.id ?? null,
		groupId: group?.id ?? null,
		rank: request.rank && filterOptions.ranks.includes(request.rank) ? request.rank : null,
		mos: pick(request.mos, filterOptions.mos),
		roles: pick(request.roles, filterOptions.roles),
		typeIds: pick(
			request.typeIds,
			columns.map((type) => type.id)
		),
		horizonDays: request.horizonDays,
		rowsBy: request.rowsBy
	};

	return {
		input,
		organizationName: organization.name,
		filterOptions,
		briefingInput: {
			personnel,
			types: columns,
			records,
			filters: {
				groupId: input.groupId ?? undefined,
				rank: input.rank ?? undefined,
				mos: input.mos,
				role: input.roles,
				trainingTypeIds: input.typeIds
			},
			horizonDays: input.horizonDays,
			asOf: formatToday(),
			goalPercent: organization.trainingReadinessGoalPercent,
			rowsBy: input.rowsBy,
			scopeName: group?.name ?? organization.name
		}
	};
}

function selectedColumns(source: BriefingSource): TrainingType[] {
	const { types, filters } = source.briefingInput;
	const selected = filters.trainingTypeIds ?? [];
	return selected.length === 0 ? types : types.filter((type) => selected.includes(type.id));
}

export async function fetchTrainingBriefingReport(
	ctx: TrainingReportReadContext,
	request: TrainingBriefingReportInput
): Promise<TrainingBriefingReportData> {
	const source = await loadBriefingSource(ctx, request);
	return {
		input: source.input,
		organizationName: source.organizationName,
		briefing: buildTrainingBriefing(source.briefingInput),
		filterOptions: source.filterOptions
	};
}

/** The affected requirements behind one grid cell or focus area, re-derived from the same filters. */
export async function fetchTrainingBriefingDetail(
	ctx: TrainingReportReadContext,
	request: TrainingBriefingDetailInput
): Promise<TrainingBriefingDetail> {
	const source = await loadBriefingSource(ctx, request.report);
	const requirements = matchBriefingRequirements(source.briefingInput, request.scope);
	if (!requirements) fail(404, 'Training report scope not found');

	const totalPages = Math.max(1, Math.ceil(requirements.length / request.pageSize));
	const page = Math.min(request.page, totalPages);
	const start = (page - 1) * request.pageSize;
	const people = new Map(source.briefingInput.personnel.map((person) => [person.id, person]));
	const typeNames = new Map(source.briefingInput.types.map((type) => [type.id, type.name]));
	const rows = requirements.slice(start, start + request.pageSize).map((requirement) => {
		const person = people.get(requirement.personId) as Personnel;
		return {
			personId: person.id,
			rank: person.rank,
			name: `${person.lastName}, ${person.firstName}`,
			groupName: person.groupName,
			typeId: requirement.typeId,
			typeName: typeNames.get(requirement.typeId) ?? '',
			status: requirement.status,
			label: requirement.label,
			expirationDate: requirement.expirationDate,
			lapseDate: requirement.lapseDate,
			lapsesInHorizon: requirement.lapsesInHorizon
		};
	});

	return { scope: request.scope, rows, totalRows: requirements.length, page, pageSize: request.pageSize, totalPages };
}

/** The retained per-soldier status workbook for exactly the population and columns the briefing shows. */
export async function generateTrainingReportWorkbookExport(
	ctx: TrainingReportReadContext,
	request: TrainingBriefingReportInput
): Promise<TrainingReportWorkbookExport> {
	const source = await loadBriefingSource(ctx, request);
	const { personnel, filters, records } = source.briefingInput;
	const columns = selectedColumns(source);
	const pivotRows = buildPivotTableFromMatrix(
		buildTrainingReportMatrix(filterPersonnel(personnel, filters), columns, records)
	).sort(
		(a, b) => a.person.lastName.localeCompare(b.person.lastName) || a.person.firstName.localeCompare(b.person.firstName)
	);
	const workbook = await buildTrainingReportWorkbook(pivotRows, columns);
	return {
		buffer: await writeWorkbookBuffer(workbook),
		filename: `training-report-${source.briefingInput.asOf}.xlsx`
	};
}
