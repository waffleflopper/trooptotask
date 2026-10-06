import { z } from 'zod';
import { fail } from '$lib/errors';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { CriticalTaskLibraryPersistence } from '../contracts';

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
const updateSchema = createSchema.partial().extend({ id: z.string() });

interface IctTaskWriteContext {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'create' | 'update'>;
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
	ctx.audit.log({ action: 'ict_task.updated', resourceType: 'ict_task', resourceId: id });
	return task;
}
