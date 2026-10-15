import { describe, expect, it } from 'vitest';
import { completionCreateSchema, completionUpdateSchema } from './personnelIctCompletionMapping.server';

const PERSON_1 = '00000000-0000-4000-8000-00000000f001';
const TASK_1 = '00000000-0000-4000-8000-00000000f002';
const COMPLETION_1 = '00000000-0000-4000-8000-00000000f003';

describe('completion input validation', () => {
	it('allows nullable validation details while requiring the completion date and method', () => {
		const valid = completionCreateSchema.safeParse({
			personnelId: PERSON_1,
			ictTaskId: TASK_1,
			completedAt: '2026-04-01',
			validationMethod: 'Lecture'
		});
		const missingMethod = completionCreateSchema.safeParse({
			personnelId: PERSON_1,
			ictTaskId: TASK_1,
			completedAt: '2026-04-01'
		});

		expect(valid.success).toBe(true);
		expect(missingMethod.success).toBe(false);
	});

	it('preserves partial updates and strips protected values at the input boundary', () => {
		expect(
			completionUpdateSchema.parse({
				id: COMPLETION_1,
				completedAt: '2026-04-02',
				validatedBy: null,
				loggedBy: 'spoofed',
				createdAt: 'changed',
				organizationId: 'foreign'
			})
		).toEqual({ id: COMPLETION_1, completedAt: '2026-04-02', validatedBy: null });
	});
});
