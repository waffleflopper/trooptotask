import { describe, expect, it } from 'vitest';
import { completionCreateSchema, completionUpdateSchema } from './personnelIctCompletionMapping.server';

describe('completion input validation', () => {
	it('allows nullable validation details while requiring the completion date and method', () => {
		const valid = completionCreateSchema.safeParse({
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01',
			validationMethod: 'Lecture'
		});
		const missingMethod = completionCreateSchema.safeParse({
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01'
		});

		expect(valid.success).toBe(true);
		expect(missingMethod.success).toBe(false);
	});

	it('preserves partial updates and strips protected values at the input boundary', () => {
		expect(
			completionUpdateSchema.parse({
				id: 'completion-1',
				completedAt: '2026-04-02',
				validatedBy: null,
				loggedBy: 'spoofed',
				createdAt: 'changed',
				organizationId: 'foreign'
			})
		).toEqual({ id: 'completion-1', completedAt: '2026-04-02', validatedBy: null });
	});
});
