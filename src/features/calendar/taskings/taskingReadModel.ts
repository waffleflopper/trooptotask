import { z } from 'zod';

export const taskingRowFactsSchema = z.object({
	eventRelation: z.enum(['standalone', 'preparation', 'execution', 'closeout']),
	picked: z.number(),
	required: z.number().nullable(),
	equipment: z.object({
		ready: z.number(),
		total: z.number(),
		returnedQuantity: z.number(),
		totalQuantity: z.number()
	}),
	conflicts: z.number(),
	nextDate: z.string(),
	suspenseOn: z.string(),
	status: z.enum(['open', 'in_progress', 'blocked', 'completed', 'cancelled']),
	responsibleGroupId: z.string().nullable()
});
export type TaskingRowFacts = z.infer<typeof taskingRowFactsSchema>;

export const eventTaskingSummarySchema = z.object({
	total: z.number(),
	needAction: z.number(),
	overdue: z.number(),
	blocked: z.number(),
	needPeople: z.number(),
	fullyStaffedAndReady: z.number(),
	conflicts: z.number()
});
export type EventTaskingSummary = z.infer<typeof eventTaskingSummarySchema>;

export const taskingWorkspaceSchema = z.object({
	taskings: z.record(z.string(), taskingRowFactsSchema),
	events: z.record(z.string(), eventTaskingSummarySchema),
	counts: z.object({
		active: z.number(),
		overdue: z.number(),
		blocked: z.number(),
		needsPeople: z.number(),
		completed: z.number()
	})
});
export type TaskingWorkspace = z.infer<typeof taskingWorkspaceSchema>;
