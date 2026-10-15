import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { error } from '@sveltejs/kit';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { z } from 'zod';
import { uuidSchema, issueMessage } from '$lib/utils/inputSchemas';
import { GROUP_UNAVAILABLE_MESSAGE, type GroupPersistence } from './contracts';

interface GroupWriteContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	groups: Pick<GroupPersistence, 'create' | 'update' | 'delete'>;
}
const createInput = z.object({
	name: z.string().min(1, 'Group name is required').max(100, 'Group name must be 100 characters or fewer'),
	sortOrder: z.number().int().optional()
});
const updateInput = createInput.partial().extend({ id: uuidSchema });
function validatedInput<T>(schema: z.ZodType<T>, input: Record<string, unknown>): T {
	const result = schema.safeParse(input);
	if (!result.success) throw error(400, issueMessage(result.error));
	return result.data;
}

async function requireGroupManager(ctx: GroupWriteContext, id?: string): Promise<void> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.manageGroups, { kind: 'organization' }, 'group', id);
}

export async function createGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const data = validatedInput(createInput, input);
	await requireGroupManager(ctx);
	const row = await ctx.groups.create(data);
	ctx.audit.log({ action: 'group.created', resourceType: 'group', resourceId: row.id as string | undefined });
	return row;
}

export async function updateGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const data = validatedInput(updateInput, input);
	const id = data.id as string;
	await requireGroupManager(ctx, id);
	const row = await ctx.groups.update(id, { name: data.name, sortOrder: data.sortOrder });
	if (!row) throw error(404, GROUP_UNAVAILABLE_MESSAGE);
	ctx.audit.log({ action: 'group.updated', resourceType: 'group', resourceId: id });
	return row;
}

export async function deleteGroup(ctx: GroupWriteContext, id: string): Promise<void> {
	await requireGroupManager(ctx, id);
	await ctx.groups.delete(id);
	ctx.audit.log({ action: 'group.deleted', resourceType: 'group', resourceId: id });
}
