import { z } from 'zod';
import type {
	CriticalTasksMatrixExportInput,
	CriticalTasksReportInput
} from '$lib/server/core/useCases/criticalTasksReportsQuery';

export const PRIVATE_REPORT_HEADERS = {
	'Cache-Control': 'private, no-store',
	Vary: 'Cookie'
} as const;

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
	rank: z.string().optional()
});

export type CriticalTasksReportRouteInput = z.infer<typeof criticalTasksReportInput>;

export const criticalTasksMatrixExportInput = z.object({
	groupId: z.string().optional(),
	groupFilter: z.string().optional(),
	gapsOnly: z.boolean().default(false),
	search: z.string().optional()
});

export type CriticalTasksMatrixExportRouteInput = z.infer<typeof criticalTasksMatrixExportInput>;

export function parseCriticalTasksReportInput(url: URL): CriticalTasksReportRouteInput {
	return {
		groupId: optionalParam(url.searchParams.get('groupId')),
		mos: normalizeMosValues(url.searchParams.getAll('mos')),
		role: optionalParam(url.searchParams.get('role')),
		rank: optionalParam(url.searchParams.get('rank'))
	};
}

export function parseCriticalTasksMatrixExportInput(url: URL): CriticalTasksMatrixExportRouteInput {
	return {
		groupId: optionalParam(url.searchParams.get('groupId')),
		groupFilter: optionalParam(url.searchParams.get('groupFilter')),
		gapsOnly: parseBooleanParam(url.searchParams.get('gapsOnly')),
		search: optionalParam(url.searchParams.get('search'))
	};
}

export function toCriticalTasksReportInput(input: CriticalTasksReportRouteInput): CriticalTasksReportInput {
	return {
		filters: {
			groupId: input.groupId,
			mos: input.mos,
			role: input.role,
			rank: input.rank
		}
	};
}

export function toCriticalTasksMatrixExportInput(
	input: CriticalTasksMatrixExportRouteInput
): CriticalTasksMatrixExportInput {
	return {
		selectedGroupId: input.groupId,
		selectedGroupFilter: input.groupFilter,
		gapsOnly: input.gapsOnly,
		search: input.search
	};
}
