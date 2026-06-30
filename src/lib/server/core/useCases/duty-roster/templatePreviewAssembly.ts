import { fail } from '$lib/server/core/errors';
import type { DutyEventSeriesPattern } from '$features/duty-roster/duty-roster.types';
import type { QueryPorts } from '$lib/server/core/ports';
import { compareRankCodes, type RankCatalogEntry } from '$lib/domain/rankCatalog';
import type {
	DutyRosterTemplate,
	DutyRosterTemplateCountReadModel,
	DutyRosterPoolPersonnel
} from '$features/duty-roster/templates/dutyRosterTemplates';
import { resolveDutyRosterPool } from '$features/duty-roster/templates/dutyRosterPool';
import {
	buildDutyRosterCountSource,
	type DutyRosterCountSourceModel,
	type DutyRosterCountSourceRun
} from '$features/duty-roster/templates/dutyRosterCountSource';
import {
	buildDutyRosterTemplatePreview,
	type DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { loadRosterReadModel } from '$lib/server/core/useCases/rosterReadModel';
import {
	acceptedRunSnapshot,
	loadDutyRosterRunCorrectionsByRunId,
	type DutyRosterTemplateRunRow
} from './acceptedRunRecord';
import { listDutyEventsForRosterPreviewWindow } from '../dutyEventCrud';

const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';

export type AcceptedDutyRosterRunCountSource = DutyRosterTemplateCountReadModel & {
	continuationHistory: DutyRosterCountSourceModel['continuationHistory'];
	futureRunConflict: DutyRosterCountSourceModel['futureRunConflict'];
};

async function loadDutyRosterPreviewRankCatalog(ctx: QueryPorts): Promise<RankCatalogEntry[]> {
	const rows = await ctx.store.findMany<{
		code: string;
		label: string;
		service: RankCatalogEntry['service'];
		category: RankCatalogEntry['category'];
		pay_grade: RankCatalogEntry['payGrade'];
		state: RankCatalogEntry['state'];
		sort_order: number;
	}>('organization_rank_catalog', ctx.auth.orgId);
	const catalog = rows.map((row) => ({
		code: row.code,
		label: row.label,
		service: row.service,
		category: row.category,
		payGrade: row.pay_grade,
		state: row.state,
		sortOrder: row.sort_order
	}));

	return catalog.toSorted((left, right) => compareRankCodes(left.code, right.code, { catalog }));
}

export async function loadAcceptedDutyRosterRunCountSource(
	ctx: QueryPorts,
	input: {
		template: DutyRosterTemplate;
		personnel: DutyRosterPoolPersonnel[];
		baselineStartDate?: string;
		previewStartDate?: string;
		previewEndDate?: string;
	}
): Promise<AcceptedDutyRosterRunCountSource> {
	const runRows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: input.template.id },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: true }]
		}
	);
	const correctionsByRunId = await loadDutyRosterRunCorrectionsByRunId(
		ctx,
		runRows.map((row) => row.id)
	);
	const resolvedPool = resolveDutyRosterPool({
		criteria: input.template.poolCriteria,
		personnel: input.personnel
	}).filter((person) => !input.template.exemptPersonnelIds.includes(person.id));
	const runs: DutyRosterCountSourceRun[] = runRows.map((row) => ({
		id: row.id,
		status: row.status,
		acceptedAt: row.accepted_at,
		snapshot: acceptedRunSnapshot(row),
		corrections: (correctionsByRunId.get(row.id) ?? []).map((correction) => ({
			runRowDate: correction.run_row_date,
			replacementAssigneeId: correction.replacement_assignee_id,
			reason: correction.reason
		}))
	}));

	return buildDutyRosterCountSource({
		template: input.template,
		resolvedPool,
		runs,
		baselineStartDate: input.baselineStartDate,
		previewStartDate: input.previewStartDate,
		previewEndDate: input.previewEndDate
	});
}

export async function listActiveDutyRosterPersonnel(ctx: QueryPorts): Promise<DutyRosterPoolPersonnel[]> {
	const roster = await loadRosterReadModel(ctx, { status: 'active' });

	return roster.full({ status: 'active' }).flatPersonnel.map((person) => ({
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		mos: person.mos ?? '',
		dutyRole: person.clinicRole ?? '',
		groupId: person.groupId ?? null,
		groupName: person.groupName ?? '',
		archivedAt: person.archivedAt ?? null
	}));
}

export async function loadDutyRosterTemplateCountReadModelSource(
	ctx: QueryPorts,
	template: DutyRosterTemplate,
	input: {
		baselineStartDate?: string;
		previewStartDate?: string;
		previewEndDate?: string;
		personnel?: DutyRosterPoolPersonnel[];
	} = {}
): Promise<AcceptedDutyRosterRunCountSource> {
	const personnel = input.personnel ?? (await listActiveDutyRosterPersonnel(ctx));
	return loadAcceptedDutyRosterRunCountSource(ctx, {
		template,
		personnel,
		baselineStartDate: input.baselineStartDate,
		previewStartDate: input.previewStartDate,
		previewEndDate: input.previewEndDate
	});
}

export function toDutyRosterTemplateCountReadModel(
	readModel: AcceptedDutyRosterRunCountSource
): DutyRosterTemplateCountReadModel {
	return {
		templateId: readModel.templateId,
		source: readModel.source,
		sourceLabel: readModel.sourceLabel,
		sourceDescription: readModel.sourceDescription,
		rows: readModel.rows,
		acceptedRunCount: readModel.acceptedRunCount,
		invalidatedRunCount: readModel.invalidatedRunCount,
		countingCorrectionCount: readModel.countingCorrectionCount,
		nonCountingCorrectionCount: readModel.nonCountingCorrectionCount
	};
}

export async function buildDutyRosterTemplatePreviewFromCurrentState(
	ctx: QueryPorts,
	input: {
		template: DutyRosterTemplate;
		startDate: string;
		endDate: string;
		pattern?: DutyEventSeriesPattern;
		selectedWeekdays?: number[];
		skipHolidaysAndDonsas?: boolean;
		generatedAt?: string;
	}
): Promise<DutyRosterTemplatePreview> {
	const personnel = await listActiveDutyRosterPersonnel(ctx);
	const [statusTypeRows, availabilityRows, specialDayRows, dutyEvents, countReadModel, rankCatalog] = await Promise.all(
		[
			ctx.store.findMany<Record<string, unknown>>('status_types', ctx.auth.orgId, undefined, {
				select: StatusTypeEntity.select,
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('availability_entries', ctx.auth.orgId, undefined, {
				select: AvailabilityEntryEntity.select,
				rangeFilters: [
					{ column: 'end_date', op: 'gte', value: input.startDate },
					{ column: 'start_date', op: 'lte', value: input.endDate }
				]
			}),
			ctx.store.findMany<Record<string, unknown>>('special_days', ctx.auth.orgId, undefined, {
				select: SpecialDayEntity.select,
				rangeFilters: [
					{ column: 'date', op: 'gte', value: input.startDate },
					{ column: 'date', op: 'lte', value: input.endDate }
				],
				orderBy: [{ column: 'date', ascending: true }]
			}),
			listDutyEventsForRosterPreviewWindow(ctx, { startDate: input.startDate, endDate: input.endDate }),
			loadDutyRosterTemplateCountReadModelSource(ctx, input.template, {
				baselineStartDate: input.startDate,
				previewStartDate: input.startDate,
				previewEndDate: input.endDate,
				personnel
			}),
			loadDutyRosterPreviewRankCatalog(ctx)
		]
	);

	return buildDutyRosterTemplatePreview({
		template: input.template,
		personnel,
		advancedDutyEvents: dutyEvents,
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
		rankCatalog: rankCatalog.length > 0 ? rankCatalog : undefined,
		continuationHistory: countReadModel.continuationHistory,
		futureRunConflict: countReadModel.futureRunConflict,
		startDate: input.startDate,
		endDate: input.endDate,
		pattern: input.pattern,
		selectedWeekdays: input.selectedWeekdays,
		skipHolidaysAndDonsas: input.skipHolidaysAndDonsas,
		generatedAt: input.generatedAt
	});
}

export function assertReviewedDutyRosterTemplatePreviewIsCurrent(input: {
	reviewedPreview: DutyRosterTemplatePreview;
	currentPreview: DutyRosterTemplatePreview;
}): void {
	if (
		JSON.stringify(reviewedPreviewPayload(input.reviewedPreview)) !==
		JSON.stringify(reviewedPreviewPayload(input.currentPreview))
	) {
		fail(409, 'Duty Roster preview changed. Generate the preview again before accepting.');
	}
}

function reviewedPreviewPayload(preview: DutyRosterTemplatePreview): Record<string, unknown> {
	return {
		generatedAt: preview.generatedAt,
		assignmentType: preview.assignmentType,
		config: preview.config,
		personnel: preview.personnel,
		selectionPersonnel: preview.selectionPersonnel,
		rosterRows: preview.rosterRows,
		da6: preview.da6,
		exportModel: preview.exportModel,
		warnings: preview.warnings,
		futureRunConflict: preview.futureRunConflict
	};
}
