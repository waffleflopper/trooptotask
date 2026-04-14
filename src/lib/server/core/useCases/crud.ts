/**
 * Generic CRUD use cases powering `entityHandlers()`.
 *
 * `createCrudUseCases(config)` returns create/update/delete handlers tied to a specific
 * EntityDefinition. In most cases you don't call this directly — use `entityHandlers(entity)`
 * in +server.ts, which wires these up automatically.
 *
 * Direct use is only needed for mixed-action routes or tests that need to exercise the
 * use cases in isolation. See `CrudConfig` for the escape-hatch interface.
 */
import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import type { EntityDefinition } from '$lib/server/entitySchema';
import type { FeatureArea } from '$lib/server/core/ports';
import type { z } from 'zod';

/**
 * @deprecated Use `entityHandlers(entity, hooks?)` from `httpAdapter.ts` instead.
 * This type exists only as a low-level escape hatch for mixed-action routes and
 * use-case tests that need to exercise `createCrudUseCases()` directly. Do not
 * introduce new route wiring with `CrudConfig`; prefer entity-driven handlers.
 */
export interface CrudConfig<C extends WritePorts = WritePorts> {
	entity: EntityDefinition;
	permission: FeatureArea;
	auditResource: string;
	requireFullEditor?: boolean;
	requirePrivileged?: boolean;
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
	const { entity, permission, auditResource } = config;

	return {
		async create(ctx, data) {
			if (config.requirePrivileged) {
				ctx.auth.requirePrivileged();
			} else if (config.requireFullEditor) {
				ctx.auth.requireFullEditor();
			}
			ctx.auth.requireEdit(permission);

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			const validated = parseOrFail(entity.createSchema, data);

			// Group scope: if entity has a personnelIdField, enforce access
			if (entity.personnelIdField) {
				const personnelId = validated[entity.personnelIdField];
				if (personnelId && typeof personnelId === 'string') {
					await ctx.auth.requireGroupAccess(personnelId);
				}
			}

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
			if (config.requirePrivileged) {
				ctx.auth.requirePrivileged();
			} else if (config.requireFullEditor) {
				ctx.auth.requireFullEditor();
			}
			ctx.auth.requireEdit(permission);

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			const validated = parseOrFail(entity.updateSchema, data);
			const { id } = validated as { id: string };

			// Group scope: enforce by record lookup
			if (entity.groupScope !== 'none' && entity.personnelIdField) {
				const personnelColumn = entity.groupScope.personnelColumn;
				await ctx.auth.requireGroupAccessByRecord(entity.table, id, personnelColumn);
			}

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
			if (config.requirePrivileged) {
				ctx.auth.requirePrivileged();
			} else if (config.requireFullEditor) {
				ctx.auth.requireFullEditor();
			}
			ctx.auth.requireEdit(permission);

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			// Group scope: enforce by record lookup
			if (entity.groupScope !== 'none' && entity.personnelIdField) {
				const personnelColumn = entity.groupScope.personnelColumn;
				await ctx.auth.requireGroupAccessByRecord(entity.table, id, personnelColumn);
			}

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
