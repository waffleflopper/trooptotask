import { z } from 'zod';
import type { RequestEvent } from '@sveltejs/kit';
import {
	DEFAULT_BRIEFING_DETAIL_PAGE_SIZE,
	MAX_BRIEFING_DETAIL_PAGE_SIZE,
	parseTrainingBriefingReportInput,
	type TrainingBriefingDetailInput,
	type TrainingBriefingReportInput
} from '$features/training/contracts';

export const PRIVATE_REPORT_HEADERS = {
	'Cache-Control': 'private, no-store',
	Vary: 'Cookie'
} as const;

export function parseTrainingBriefingRequest(event: Pick<RequestEvent, 'url'>): TrainingBriefingReportInput {
	return parseTrainingBriefingReportInput(event.url.searchParams);
}

function positiveInteger(value: string | null): number | null {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const scopeSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('cell'), rowKey: z.string().nullable(), typeId: z.string().min(1) }),
	z.object({ kind: z.literal('focus'), key: z.string().min(1) })
]);

export const trainingBriefingDetailInput = z.object({
	report: z.custom<TrainingBriefingReportInput>(),
	scope: scopeSchema,
	page: z.number().int().min(1),
	pageSize: z.number().int().min(1).max(MAX_BRIEFING_DETAIL_PAGE_SIZE)
}) satisfies z.ZodType<TrainingBriefingDetailInput>;

/** Unvalidated scope fields; `trainingBriefingDetailInput` rejects a scope without its required keys. A cell omits `row` only for the Total row. */
export function parseTrainingBriefingDetailRequest(event: Pick<RequestEvent, 'url'>) {
	const params = event.url.searchParams;
	const kind = params.get('scope');
	return {
		report: parseTrainingBriefingReportInput(params),
		scope:
			kind === 'cell'
				? { kind, rowKey: params.has('row') ? params.get('row') : null, typeId: params.get('type') }
				: { kind, key: params.get('focus') },
		page: positiveInteger(params.get('page')) ?? 1,
		pageSize: Math.min(
			MAX_BRIEFING_DETAIL_PAGE_SIZE,
			positiveInteger(params.get('pageSize')) ?? DEFAULT_BRIEFING_DETAIL_PAGE_SIZE
		)
	};
}
