import { fail } from '$lib/server/core/errors';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { UseCaseContext } from '$lib/server/core/ports';

const entity = PersonnelEntity;
const AUDIT_RESOURCE = 'personnel';

export interface PersonnelUseCases {
	create(ctx: UseCaseContext, data: Record<string, unknown>): Promise<unknown>;
	update(ctx: UseCaseContext, data: Record<string, unknown>): Promise<unknown>;
	archive(ctx: UseCaseContext, id: string): Promise<{ requiresApproval: boolean } | void>;
}

export function createPersonnelUseCases(): PersonnelUseCases {
	return {
		async create(ctx, data) {
			ctx.auth.requireEdit('personnel');

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			const capCheck = await ctx.subscription.canAddPersonnel();
			if (!capCheck.allowed) {
				fail(403, capCheck.message ?? 'Personnel limit reached');
			}

			if (ctx.auth.scopedGroupId && data.groupId !== ctx.auth.scopedGroupId) {
				fail(403, 'You can only add personnel to your assigned group');
			}

			const validated = entity.createSchema.parse(data);
			const dbData = entity.toDbInsert(validated, ctx.auth.orgId);
			if (validated.groupId !== undefined) dbData.group_id = validated.groupId || null;

			const row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData, entity.select);

			ctx.subscription.invalidateTierCache();

			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.created`,
				resourceType: AUDIT_RESOURCE,
				resourceId: row.id as string | undefined
			});

			return entity.fromDb(row);
		},

		async update(ctx, data) {
			ctx.auth.requireEdit('personnel');

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			const validated = entity.updateSchema.parse(data);
			const { id } = validated as { id: string };

			await ctx.auth.requireGroupAccess(id);

			const dbData = entity.toDbUpdate(validated);
			if ((validated as Record<string, unknown>).groupId !== undefined) {
				dbData.group_id = (validated as Record<string, unknown>).groupId || null;
			}

			const row = await ctx.store.update<Record<string, unknown>>(
				entity.table,
				ctx.auth.orgId,
				id,
				dbData,
				entity.select
			);

			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.updated`,
				resourceType: AUDIT_RESOURCE,
				resourceId: id
			});

			return entity.fromDb(row);
		},

		async archive(ctx, id) {
			ctx.auth.requireEdit('personnel');

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			await ctx.auth.requireGroupAccess(id);

			if (!ctx.auth.isPrivileged && !ctx.auth.isFullEditor) {
				return { requiresApproval: true };
			}

			await ctx.store.update(entity.table, ctx.auth.orgId, id, {
				archived_at: new Date().toISOString()
			});

			ctx.subscription.invalidateTierCache();

			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.archived`,
				resourceType: AUDIT_RESOURCE,
				resourceId: id
			});
		}
	};
}
