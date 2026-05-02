/**
 * Personnel write use cases — create, update, archive.
 *
 * Personnel operations require `WriteWithSubscriptionPorts` because create checks seat
 * limits against the org's subscription tier. Archive triggers a deletion request
 * workflow if the personnel record has related data (returns `{ requiresApproval: true }`).
 *
 * For bulk import, see `personnelBatch.ts`. For queries, see `personnelQuery.ts`
 * and `personnelWorkspaceQuery.ts`.
 */
import { fail } from '$lib/server/core/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { WriteWithSubscriptionPorts } from '$lib/server/core/ports';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';

const entity = PersonnelEntity;
const AUDIT_RESOURCE = 'personnel';

export interface PersonnelUseCases {
	create(ctx: WriteWithSubscriptionPorts, data: Record<string, unknown>): Promise<unknown>;
	update(ctx: WriteWithSubscriptionPorts, data: Record<string, unknown>): Promise<unknown>;
	archive(ctx: WriteWithSubscriptionPorts, id: string): Promise<{ requiresApproval: boolean } | void>;
}

export function createPersonnelUseCases(): PersonnelUseCases {
	return {
		async create(ctx, data) {
			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResourceForGroup(data.groupId),
				AUDIT_RESOURCE
			);

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
			const validated = entity.updateSchema.parse(data);
			const { id } = validated as { id: string };
			const currentRecord = await ctx.store.findOne<{ group_id: string | null }>(entity.table, ctx.auth.orgId, { id });

			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResourceForGroup(currentRecord?.group_id),
				AUDIT_RESOURCE,
				id
			);

			if ((validated as Record<string, unknown>).groupId !== undefined) {
				await requireFeaturePolicy(
					ctx,
					POLICY_ACTION_CATALOG.personnel.manageRecords,
					policyResourceForGroup((validated as Record<string, unknown>).groupId),
					AUDIT_RESOURCE,
					id
				);
			}

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
			const currentRecord = await ctx.store.findOne<{ group_id: string | null }>(entity.table, ctx.auth.orgId, { id });

			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResourceForGroup(currentRecord?.group_id),
				AUDIT_RESOURCE,
				id
			);

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
