/**
 * Daily assignment use cases — create, update, delete, and replace assignments for a day.
 *
 * Calendar-owned slot write rules live in `daily-assignment-slots`; this file keeps the
 * existing public use-case API stable for routes and tests.
 */
import type { CalendarWritePorts } from './calendarPolicy';
import {
	clearDailyAssignmentSlot,
	createDailyAssignmentSlot,
	deleteDailyAssignmentSlot,
	replaceDailyAssignmentDay,
	setDailyAssignmentSlot,
	updateDailyAssignmentSlot
} from './daily-assignment-slots';

export interface ReplaceInput {
	date: string;
	records: Array<{ assignmentTypeId: string; assigneeId: string }>;
}

export async function replaceDailyAssignments(ctx: CalendarWritePorts, input: ReplaceInput): Promise<unknown[]> {
	return replaceDailyAssignmentDay(ctx, input);
}

export async function createDailyAssignment(ctx: CalendarWritePorts, input: Record<string, unknown>): Promise<unknown> {
	return createDailyAssignmentSlot(ctx, input);
}

export async function setDailyAssignment(ctx: CalendarWritePorts, input: Record<string, unknown>): Promise<unknown> {
	return setDailyAssignmentSlot(ctx, input);
}

export async function updateDailyAssignment(ctx: CalendarWritePorts, input: Record<string, unknown>): Promise<unknown> {
	return updateDailyAssignmentSlot(ctx, input);
}

export async function deleteDailyAssignment(ctx: CalendarWritePorts, id: string): Promise<void> {
	await deleteDailyAssignmentSlot(ctx, id);
}

export async function clearDailyAssignment(
	ctx: CalendarWritePorts,
	input: { date: string; assignmentTypeId: string }
): Promise<void> {
	await clearDailyAssignmentSlot(ctx, input);
}
