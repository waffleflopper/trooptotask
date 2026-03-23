import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { EntityDefinition } from '$lib/server/entitySchema';
import type { FeatureArea } from '$lib/server/core/ports';

export interface CrudConfig {
	entity: EntityDefinition;
	permission: FeatureArea;
	auditResource: string;
	requireFullEditor?: boolean;
	beforeDelete?: (ctx: UseCaseContext, id: string) => Promise<void>;
	afterDelete?: (ctx: UseCaseContext, id: string) => Promise<void>;
}

export interface CrudUseCases {
	create(ctx: UseCaseContext, data: Record<string, unknown>): Promise<unknown>;
	update(ctx: UseCaseContext, data: Record<string, unknown>): Promise<unknown>;
	remove(ctx: UseCaseContext, id: string): Promise<void>;
}

export function createCrudUseCases(config: CrudConfig): CrudUseCases {
	const { entity, permission, auditResource } = config;

	return {
		async create(ctx, data) {
			if (config.requireFullEditor) {
				ctx.auth.requireFullEditor();
			}
			ctx.auth.requireEdit(permission);

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			const validated = entity.createSchema.parse(data);

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
			if (config.requireFullEditor) {
				ctx.auth.requireFullEditor();
			}
			ctx.auth.requireEdit(permission);

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			const validated = entity.updateSchema.parse(data);
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
			if (config.requireFullEditor) {
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
