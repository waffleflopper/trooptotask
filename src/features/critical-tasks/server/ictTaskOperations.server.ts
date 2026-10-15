import { z } from 'zod';
import { fail } from '$lib/errors';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { uuidSchema } from '$lib/utils/inputSchemas';
import { ICT_TASK_UNAVAILABLE_MESSAGE, type CriticalTaskLibraryPersistence } from '../contracts';
import { ICT_TASK_ORDER_MAX_CHANGES, ICT_TASK_SORT_ORDER_MAX } from '../criticalTasks.types';

const createSchema = z.object({
	taskCode: z.string().min(1).max(64),
	title: z.string().min(1).max(200),
	description: z.string().max(2000).nullable().optional(),
	category: z.string().max(120).nullable().optional(),
	mos: z.array(z.string()).optional(),
	expirationMonths: z.number().int().positive().nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
	archivedAt: z.string().nullable().optional()
});
const updateSchema = createSchema.partial().extend({ id: uuidSchema });
const reorderSchema = z.object({
	changes: z
		.array(
			z.object({
				id: uuidSchema,
				expectedSortOrder: z.number().int().min(0).max(ICT_TASK_SORT_ORDER_MAX),
				sortOrder: z.number().int().min(0).max(ICT_TASK_SORT_ORDER_MAX)
			})
		)
		.min(1)
		.max(ICT_TASK_ORDER_MAX_CHANGES)
		.refine((changes) => new Set(changes.map((change) => change.id)).size === changes.length, 'Move each task once')
});

interface IctTaskWriteContext {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'create' | 'update' | 'reorder'>;
}

function parseOrFail<T>(schema: z.ZodType<T>, input: Record<string, unknown>): T {
	const result = schema.safeParse(input);
	if (!result.success) fail(400, result.error.issues.map((issue) => issue.message).join('; '));
	return result.data;
}

export async function createIctTask(ctx: IctTaskWriteContext, input: Record<string, unknown>) {
	const values = parseOrFail(createSchema, input);
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
		{ kind: 'organization' },
		'ict_task'
	);
	const task = await ctx.criticalTaskLibrary.create(values);
	ctx.audit.log({ action: 'ict_task.created', resourceType: 'ict_task', resourceId: task.id });
	return task;
}

export async function updateIctTask(ctx: IctTaskWriteContext, input: Record<string, unknown>) {
	const { id, ...patch } = parseOrFail(updateSchema, input);
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
		{ kind: 'organization' },
		'ict_task',
		id
	);
	const task = await ctx.criticalTaskLibrary.update(id, patch);
	if (!task) fail(404, ICT_TASK_UNAVAILABLE_MESSAGE);
	ctx.audit.log({ action: 'ict_task.updated', resourceType: 'ict_task', resourceId: id });
	return task;
}

export async function reorderIctTasks(ctx: IctTaskWriteContext, input: Record<string, unknown>) {
	const { changes } = parseOrFail(reorderSchema, input);
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
		{ kind: 'organization' },
		'ict_task'
	);
	const tasks = await ctx.criticalTaskLibrary.reorder(changes);
	const moved = new Set(
		changes.filter((change) => change.expectedSortOrder !== change.sortOrder).map((change) => change.id)
	);
	for (const task of tasks) {
		if (moved.has(task.id))
			ctx.audit.log({ action: 'ict_task.reordered', resourceType: 'ict_task', resourceId: task.id });
	}
	return tasks;
}
