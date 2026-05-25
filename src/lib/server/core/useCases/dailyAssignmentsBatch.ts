/**
 * Bulk daily assignment use case — import assignments across many dates at once.
 *
 * Calendar-owned slot write rules live in `daily-assignment-slots`; this file keeps the
 * existing public use-case API stable for Duty Roster and CSV import callers.
 */
import type { WritePorts } from '$lib/server/core/ports';
import {
	replaceDailyAssignmentSlotsBatch,
	type DailyAssignmentSlotBatchResult,
	type DailyAssignmentSlotRecord
} from './daily-assignment-slots';

export async function batchDailyAssignments(
	ctx: WritePorts,
	input: { records: DailyAssignmentSlotRecord[] }
): Promise<DailyAssignmentSlotBatchResult> {
	return replaceDailyAssignmentSlotsBatch(ctx, input);
}
