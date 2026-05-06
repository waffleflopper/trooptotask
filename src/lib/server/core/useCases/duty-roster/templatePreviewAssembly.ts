import { fail } from '$lib/server/core/errors';
import type { QueryPorts } from '$lib/server/core/ports';
import type {
	DutyRosterTemplate,
	DutyRosterTemplateCountReadModel,
	DutyRosterPoolPersonnel
} from '$features/duty-roster/templates/dutyRosterTemplates';
import {
	buildDutyRosterTemplatePreview,
	type DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { loadAcceptedDutyRosterRunCountSource, type AcceptedDutyRosterRunCountSource } from './acceptedRuns';

export async function listActiveDutyRosterPersonnel(ctx: QueryPorts): Promise<DutyRosterPoolPersonnel[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel',
		ctx.auth.orgId,
		{},
		{
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [
				{ column: 'last_name', ascending: true },
				{ column: 'first_name', ascending: true }
			]
		}
	);

	return PersonnelEntity.fromDbArray(rows).map((person) => ({
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
	input: { baselineStartDate?: string; personnel?: DutyRosterPoolPersonnel[] } = {}
): Promise<AcceptedDutyRosterRunCountSource> {
	const personnel = input.personnel ?? (await listActiveDutyRosterPersonnel(ctx));
	return loadAcceptedDutyRosterRunCountSource(ctx, {
		template,
		personnel,
		baselineStartDate: input.baselineStartDate
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
		generatedAt?: string;
	}
): Promise<DutyRosterTemplatePreview> {
	const personnel = await listActiveDutyRosterPersonnel(ctx);
	const [statusTypeRows, availabilityRows, specialDayRows, countReadModel] = await Promise.all([
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
		loadDutyRosterTemplateCountReadModelSource(ctx, input.template, {
			baselineStartDate: input.startDate,
			personnel
		})
	]);

	return buildDutyRosterTemplatePreview({
		template: input.template,
		personnel,
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
		continuationHistory: countReadModel.continuationHistory,
		startDate: input.startDate,
		endDate: input.endDate,
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
		warnings: preview.warnings
	};
}
