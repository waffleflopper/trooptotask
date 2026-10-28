import { z } from 'zod';

const note = z.object({ text: z.string(), timestamp: z.string(), userId: z.string() }).passthrough();
const step = z
	.object({
		id: z.string(),
		onboarding_id: z.string(),
		template_step_id: z.string().nullable(),
		step_name: z.string(),
		step_type: z.string(),
		training_type_id: z.string().nullable(),
		stages: z.array(z.string()).nullable(),
		sort_order: z.number(),
		completed: z.boolean(),
		current_stage: z.string().nullable(),
		notes: z.array(note),
		active: z.boolean(),
		progress_changed_at: z.string()
	})
	.passthrough();

export const reconciliationResult = z
	.object({
		onboarding_id: z.string(),
		template_id: z.string(),
		old_template_id: z.string().nullable(),
		steps: z.array(step)
	})
	.passthrough();

export const noteAppendResult = z.object({ id: z.string(), notes: z.array(note) }).passthrough();

export const packetCreationResult = z
	.object({
		onboarding: z
			.object({
				id: z.string(),
				personnel_id: z.string(),
				template_id: z.string(),
				status: z.enum(['in_progress', 'completed', 'cancelled']),
				started_at: z.string(),
				completed_at: z.string().nullable(),
				cancelled_at: z.string().nullable()
			})
			.passthrough(),
		steps: z.array(step)
	})
	.passthrough();
