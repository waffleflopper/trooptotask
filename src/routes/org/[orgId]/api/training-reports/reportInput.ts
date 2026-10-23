import { z } from 'zod';
import type { RequestEvent } from '@sveltejs/kit';
import {
	DEFAULT_BRIEFING_DETAIL_PAGE_SIZE,
	MAX_BRIEFING_DETAIL_PAGE_SIZE,
	parseTrainingBriefingReportInput,
	type TrainingBriefingDetailInput,
	type TrainingBriefingReportInput
} from '$features/training/contracts';
import { viewerToday } from '$lib/server/viewerDay.server';

/** A report request evaluated on the viewer's day, kept out of the bookmarkable report URL. */
export interface ViewerDayRequest<T> {
	request: T;
	asOf: string;
}

export function parseTrainingBriefingRequest(
	event: Pick<RequestEvent, 'url' | 'cookies'>
): ViewerDayRequest<TrainingBriefingReportInput> {
	return { request: parseTrainingBriefingReportInput(event.url.searchParams), asOf: viewerToday(event.cookies) };
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

export const trainingBriefingDetailRequest = z.object({
	request: trainingBriefingDetailInput,
	asOf: z.string()
}) satisfies z.ZodType<ViewerDayRequest<TrainingBriefingDetailInput>>;

/** Unvalidated scope fields; `trainingBriefingDetailInput` rejects a scope without its required keys. A cell omits `row` only for the Total row. */
export function parseTrainingBriefingDetailRequest(event: Pick<RequestEvent, 'url' | 'cookies'>) {
	const params = event.url.searchParams;
	const kind = params.get('scope');
	const request = {
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
	return { request, asOf: viewerToday(event.cookies) };
}
