/**
 * Generic CRUD use cases powering `entityHandlers()`.
 *
 * `createCrudUseCases(config)` returns create/update/delete handlers tied to a specific
 * EntityDefinition. In most cases you don't call this directly — use `entityHandlers(entity)`
 * in +server.ts, which wires these up automatically.
 *
 * Direct use is only needed for tests that need to exercise the use cases in isolation.
 * See `CrudConfig` for the policy-first interface.
 */
import { fail } from '$lib/server/core/errors';
import type { DataStore, WritePorts } from '$lib/server/core/ports';
import type { EntityDefinition } from '$lib/server/entitySchema';
import type { z } from 'zod';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from './featurePolicy';
import { requireCalendarPolicy } from './calendarPolicy';

export interface CrudConfig<C extends WritePorts = WritePorts> {
	entity: EntityDefinition;
	auditResource: string;
	policyAction: FeatureLanePolicyAction;
	beforeDelete?: (ctx: C, id: string) => Promise<void>;
	afterDelete?: (ctx: C, id: string) => Promise<void>;
}

export interface CrudUseCases<C extends WritePorts = WritePorts> {
	create(ctx: C, data: Record<string, unknown>): Promise<unknown>;
	update(ctx: C, data: Record<string, unknown>): Promise<unknown>;
	remove(ctx: C, id: string): Promise<void>;
}

function parseOrFail<T>(schema: z.ZodType<T>, data: Record<string, unknown>): T {
	const result = schema.safeParse(data);
	if (!result.success) {
		fail(400, result.error.issues.map((issue) => issue.message).join('; '));
	}
	return result.data;
}

export function createCrudUseCases<C extends WritePorts>(config: CrudConfig<C>): CrudUseCases<C> {
	const { entity, policyAction, auditResource } = config;

	return {
		async create(ctx, data) {
			const validated = parseOrFail(entity.createSchema, data);
			await requirePolicyDecisionForCrud(
				ctx,
				policyAction,
				await resolvePolicyResourceForCreate(ctx, entity, validated),
				auditResource
			);

			const dbData = entity.toDbInsert(validated, ctx.auth.orgId);
			const row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData, entity.select);

			ctx.audit.log({
				action: `${auditResource}.created`,
				resourceType: auditResource,
				resourceId: row.id as string | undefined
			});

			return entity.fromDb(row);
		},

		async update(ctx, data) {
			const validated = parseOrFail(entity.updateSchema, data);
			const { id } = validated as { id: string };
			await requirePolicyDecisionForCrud(
				ctx,
				policyAction,
				await resolvePolicyResourceForRecord(ctx, entity, id),
				auditResource,
				id
			);

			const dbData = entity.toDbUpdate(validated);
			const row = await ctx.store.update<Record<string, unknown>>(
				entity.table,
				ctx.auth.orgId,
				id,
				dbData,
				entity.select
			);

			ctx.audit.log({
				action: `${auditResource}.updated`,
				resourceType: auditResource,
				resourceId: id
			});

			return entity.fromDb(row);
		},

		async remove(ctx, id) {
			await requirePolicyDecisionForCrud(
				ctx,
				policyAction,
				await resolvePolicyResourceForRecord(ctx, entity, id),
				auditResource,
				id
			);

			if (config.beforeDelete) {
				await config.beforeDelete(ctx, id);
			}

			await ctx.store.delete(entity.table, ctx.auth.orgId, id);

			ctx.audit.log({
				action: `${auditResource}.deleted`,
				resourceType: auditResource,
				resourceId: id
			});

			if (config.afterDelete) {
				await config.afterDelete(ctx, id);
			}
		}
	};
}

async function requirePolicyDecisionForCrud<C extends WritePorts>(
	ctx: C,
	action: FeatureLanePolicyAction,
	resource: PolicyResource,
	auditResource: string,
	resourceId?: string
): Promise<void> {
	if (action.owner.lane === 'calendar') {
		await requireCalendarPolicy(ctx, action, resource);
		return;
	}

	await requireFeaturePolicy(ctx, action, resource, auditResource, resourceId);
}

async function resolvePolicyResourceForCreate<C extends WritePorts>(
	ctx: C,
	entity: EntityDefinition,
	data: Record<string, unknown>
): Promise<PolicyResource> {
	if (!entity.personnelIdField) {
		return { kind: 'organization' };
	}

	const personnelId = data[entity.personnelIdField];
	if (typeof personnelId !== 'string') {
		return { kind: 'organization' };
	}

	return resolvePersonnelPolicyResource(ctx, personnelId);
}

async function resolvePolicyResourceForRecord<C extends WritePorts>(
	ctx: C,
	entity: EntityDefinition,
	recordId: string
): Promise<PolicyResource> {
	if (entity.groupScope === 'none' || !entity.personnelIdField) {
		return { kind: 'organization' };
	}

	const store = getUnscopedStore(ctx);
	const record = await store.findOne<Record<string, unknown>>(entity.table, ctx.auth.orgId, { id: recordId });
	const personnelId = record?.[entity.groupScope.personnelColumn];
	if (typeof personnelId !== 'string') {
		return { kind: 'organization' };
	}

	return resolvePersonnelPolicyResource(ctx, personnelId);
}

async function resolvePersonnelPolicyResource<C extends WritePorts>(
	ctx: C,
	personnelId: string
): Promise<PolicyResource> {
	const store = getUnscopedStore(ctx);
	const person = await store.findOne<{ group_id?: string | null }>('personnel', ctx.auth.orgId, { id: personnelId });
	return person?.group_id ? { kind: 'group', groupId: person.group_id } : { kind: 'organization' };
}

function getUnscopedStore<C extends WritePorts>(ctx: C): DataStore {
	return ctx.rawStore ?? ctx.store;
}
