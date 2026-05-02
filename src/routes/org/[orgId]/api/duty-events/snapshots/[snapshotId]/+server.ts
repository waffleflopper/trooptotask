import { z } from 'zod';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { AdvancedDutyRunSnapshotRecord } from '$features/duty-roster/duty-roster.types';
import {
	deleteVisibleAdvancedDutyRunSnapshot,
	getVisibleAdvancedDutyRunSnapshot
} from '$lib/server/core/useCases/dutyEventCrud';

const snapshotIdInputSchema = z.object({
	snapshotId: z.string().uuid('Snapshot ID must be a valid UUID.')
});

export const _getConfig: RouteConfig<{ snapshotId: string }, AdvancedDutyRunSnapshotRecord> = {
	permission: 'calendar',
	input: snapshotIdInputSchema,
	parseInput: (event) => ({
		snapshotId: event.params.snapshotId as string
	}),
	fn: (ctx, input) => getVisibleAdvancedDutyRunSnapshot(ctx, input.snapshotId)
};

export const _deleteConfig: RouteConfig<{ snapshotId: string }, { success: true }> = {
	permission: 'calendar',
	mutation: true,
	deferPolicyToUseCase: true,
	input: snapshotIdInputSchema,
	parseInput: (event) => ({
		snapshotId: event.params.snapshotId as string
	}),
	fn: (ctx, input) => deleteVisibleAdvancedDutyRunSnapshot(ctx, input.snapshotId)
};

export const GET = handle(_getConfig);
export const DELETE = handle(_deleteConfig);
