import { z } from 'zod';
import type { TrainingReportInput } from '$lib/server/core/useCases/trainingReportsQuery';

export const PRIVATE_REPORT_HEADERS = {
	'Cache-Control': 'private, no-store',
	Vary: 'Cookie'
} as const;

const statusSchema = z.enum([
	'current',
	'warning-yellow',
	'warning-orange',
	'expired',
	'not-completed',
	'not-required',
	'exempt'
]);

export const trainingReportInput = z.object({
	groupId: z.string().optional(),
	mos: z.string().optional(),
	role: z.string().optional(),
	rank: z.string().optional(),
	status: statusSchema.optional(),
	trainingTypeIds: z.array(z.string()).default([]),
	sortColumn: z.string().default('name'),
	sortDirection: z.enum(['asc', 'desc']).default('asc'),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(25)
});

export type TrainingReportRouteInput = z.infer<typeof trainingReportInput>;

function optionalParam(value: string | null): string | undefined {
	return value || undefined;
}

function parsePositiveIntParam(value: string | null, fallback: number): number {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseTrainingReportInput(url: URL): TrainingReportRouteInput {
	return {
		groupId: optionalParam(url.searchParams.get('groupId')),
		mos: optionalParam(url.searchParams.get('mos')),
		role: optionalParam(url.searchParams.get('role')),
		rank: optionalParam(url.searchParams.get('rank')),
		status: optionalParam(url.searchParams.get('status')) as TrainingReportRouteInput['status'],
		trainingTypeIds: url.searchParams.getAll('trainingTypeId'),
		sortColumn: url.searchParams.get('sortColumn') ?? 'name',
		sortDirection: (url.searchParams.get('sortDirection') ?? 'asc') as TrainingReportRouteInput['sortDirection'],
		page: parsePositiveIntParam(url.searchParams.get('page'), 1),
		pageSize: parsePositiveIntParam(url.searchParams.get('pageSize'), 25)
	};
}

export function toTrainingReportInput(input: TrainingReportRouteInput): TrainingReportInput {
	return {
		filters: {
			groupId: input.groupId,
			mos: input.mos,
			role: input.role,
			rank: input.rank,
			status: input.status,
			trainingTypeIds: input.trainingTypeIds
		},
		sort: {
			column: input.sortColumn,
			direction: input.sortDirection
		},
		pagination: {
			page: input.page,
			pageSize: input.pageSize
		}
	};
}
