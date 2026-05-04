import { z } from 'zod';

function stringField(label: string) {
	return z
		.custom<string>((value) => typeof value === 'string' && value.trim().length > 0, {
			message: `${label} is required.`
		})
		.transform((value) => value.trim());
}

function uuidField(label: string) {
	return stringField(label).pipe(z.string().uuid(`${label} must be a valid UUID.`));
}

function dateField(label: string) {
	return stringField(label).pipe(
		z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be in YYYY-MM-DD format.`)
			.refine(isValidCalendarDate, `${label} must be a real calendar date.`)
	);
}

function isValidCalendarDate(value: string): boolean {
	const [year, month, day] = value.split('-').map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

const slotOverrideSchema = z.object({
	templateSlotId: uuidField('Template slot ID').nullable(),
	slotIndex: z.number().int('Slot index must be a whole number.').min(0, 'Slot index must be zero or greater.'),
	assigneeId: uuidField('Assignee ID').nullable(),
	assignmentSource: z.enum(['manual', 'locked']).optional()
});

const eventOverrideSchema = z.object({
	eventDate: dateField('Event date'),
	slotOverrides: z.array(slotOverrideSchema)
});

const seriesPatternSchema = z.enum([
	'daily',
	'weekday-only',
	'weekend-only',
	'selected-weekdays',
	'holiday-closure-only',
	'custom-dates'
]);

export const dutyEventApplyInputSchema = z.object({
	templateId: uuidField('Template ID'),
	eventDate: dateField('Event date'),
	collisionReviewConfirmed: z.boolean().optional(),
	candidatePersonnelIds: z.array(uuidField('Candidate personnel ID')).optional(),
	slotOverrides: z.array(slotOverrideSchema).optional()
});

export const dutyEventSnapshotApplyInputSchema = dutyEventApplyInputSchema.extend({
	snapshotId: uuidField('Snapshot ID'),
	snapshotFingerprint: stringField('Snapshot fingerprint')
});

export const existingDutyEventInputSchema = z.object({
	dutyEventId: uuidField('Duty event ID'),
	slotOverrides: z.array(slotOverrideSchema).optional()
});

export const existingDutyEventUpdateInputSchema = existingDutyEventInputSchema.extend({
	collisionReviewConfirmed: z.boolean().optional()
});

export const advancedDutyRevisionReapplyInputSchema = z.object({
	dutyEventId: uuidField('Duty event ID'),
	reason: stringField('Revision reason'),
	reviewableConflictsConfirmed: z.boolean().optional()
});

export const dutyEventSeriesInputSchema = z.object({
	templateId: uuidField('Template ID'),
	startDate: dateField('Start date').optional(),
	endDate: dateField('End date').optional(),
	pattern: seriesPatternSchema,
	selectedWeekdays: z
		.array(
			z
				.number()
				.int('Selected weekdays must be whole numbers.')
				.min(0, 'Selected weekdays must be between 0 and 6.')
				.max(6, 'Selected weekdays must be between 0 and 6.')
		)
		.optional(),
	customDates: z.array(dateField('Custom date')).optional(),
	collisionReviewConfirmed: z.boolean().optional(),
	candidatePersonnelIds: z.array(uuidField('Candidate personnel ID')).optional(),
	eventOverrides: z.array(eventOverrideSchema).optional()
});

export const dutyEventSeriesSnapshotApplyInputSchema = dutyEventSeriesInputSchema.extend({
	snapshotId: uuidField('Snapshot ID'),
	snapshotFingerprint: stringField('Snapshot fingerprint')
});

export const dutyEventIdInputSchema = z.object({
	dutyEventId: uuidField('Duty event ID')
});

export const dutyEventRunIdInputSchema = z.object({
	runId: uuidField('Run ID')
});

export const legacyDutyEventDeleteInputSchema = z.object({
	eventIds: z.array(uuidField('Duty event ID')).min(1, 'At least one duty event ID is required.')
});
