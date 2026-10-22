import { z } from 'zod';
import type { RequestEvent } from '@sveltejs/kit';
import type { CriticalTasksMatrixExportInput, CriticalTasksReportInput } from '$features/critical-tasks/contracts';
import { viewerTimeZone, viewerToday } from '$lib/server/viewerDay.server';

type ReportRequestEvent = Pick<RequestEvent, 'url' | 'cookies'>;

function optionalParam(value: string | null): string | undefined {
	return value || undefined;
}

function normalizeMosValues(values: string | string[] | undefined): string[] | undefined {
	if (!values) return undefined;
	const rawValues = Array.isArray(values) ? values : [values];
	const normalized = [
		...new Set(
			rawValues
				.flatMap((value) => value.split(','))
				.map((value) => value.trim())
				.filter(Boolean)
		)
	];
	return normalized.length > 0 ? normalized : undefined;
}

function parseBooleanParam(value: string | null): boolean {
	return value === 'true' || value === '1';
}

export const criticalTasksReportInput = z.object({
	groupId: z.string().optional(),
	mos: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.transform(normalizeMosValues),
	role: z.string().optional(),
	rank: z.string().optional(),
	asOf: z.string(),
	timeZone: z.string()
});

export type CriticalTasksReportRouteInput = z.infer<typeof criticalTasksReportInput>;

export const criticalTasksMatrixExportInput = z.object({
	groupId: z.string().optional(),
	groupFilter: z.string().optional(),
	gapsOnly: z.boolean().default(false),
	search: z.string().optional(),
	asOf: z.string()
});

export type CriticalTasksMatrixExportRouteInput = z.infer<typeof criticalTasksMatrixExportInput>;

export function parseCriticalTasksReportInput({ url, cookies }: ReportRequestEvent): CriticalTasksReportRouteInput {
	return {
		groupId: optionalParam(url.searchParams.get('groupId')),
		mos: normalizeMosValues(url.searchParams.getAll('mos')),
		role: optionalParam(url.searchParams.get('role')),
		rank: optionalParam(url.searchParams.get('rank')),
		asOf: viewerToday(cookies),
		timeZone: viewerTimeZone(cookies)
	};
}

export function parseCriticalTasksMatrixExportInput({
	url,
	cookies
}: ReportRequestEvent): CriticalTasksMatrixExportRouteInput {
	return {
		groupId: optionalParam(url.searchParams.get('groupId')),
		groupFilter: optionalParam(url.searchParams.get('groupFilter')),
		gapsOnly: parseBooleanParam(url.searchParams.get('gapsOnly')),
		search: optionalParam(url.searchParams.get('search')),
		asOf: viewerToday(cookies)
	};
}

export function toCriticalTasksReportInput(input: CriticalTasksReportRouteInput): CriticalTasksReportInput {
	return {
		filters: {
			groupId: input.groupId,
			mos: input.mos,
			role: input.role,
			rank: input.rank
		},
		asOf: input.asOf,
		timeZone: input.timeZone
	};
}

export function toCriticalTasksMatrixExportInput(
	input: CriticalTasksMatrixExportRouteInput
): CriticalTasksMatrixExportInput {
	return {
		selectedGroupId: input.groupId,
		selectedGroupFilter: input.groupFilter,
		gapsOnly: input.gapsOnly,
		search: input.search,
		asOf: input.asOf
	};
}
