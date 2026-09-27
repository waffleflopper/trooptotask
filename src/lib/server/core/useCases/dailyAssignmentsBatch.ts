/**
 * Bulk daily assignment use case — import assignments across many dates at once.
 *
 * Calendar-owned slot write rules live in `daily-assignment-slots`; this file keeps the
 * public batch API used by Calendar imports.
 */
import type { CalendarWritePorts } from './calendarPolicy';
import {
	replaceDailyAssignmentSlotsBatch,
	type DailyAssignmentSlotBatchResult,
	type DailyAssignmentSlotRecord
} from './daily-assignment-slots';

export async function batchDailyAssignments(
	ctx: CalendarWritePorts,
	input: { records: DailyAssignmentSlotRecord[] }
): Promise<DailyAssignmentSlotBatchResult> {
	return replaceDailyAssignmentSlotsBatch(ctx, input);
}
