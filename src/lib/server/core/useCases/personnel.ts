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
import { evaluateFeaturePolicy, policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';
import { buildUniquePersonnelSlug } from './personnelSlug';

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
				POLICY_ACTION_CATALOG.personnel.createRecords,
				policyResourceForGroup(data.groupId),
				AUDIT_RESOURCE
			);

			const capCheck = await ctx.subscription.canAddPersonnel();
			if (!capCheck.allowed) {
				fail(403, capCheck.message ?? 'Personnel limit reached');
			}

			const validated = entity.createSchema.parse(data);
			const dbData = entity.toDbInsert(validated, ctx.auth.orgId);
			if (validated.groupId !== undefined) dbData.group_id = validated.groupId || null;
			dbData.slug = await buildUniquePersonnelSlug({
				store: ctx.store,
				orgId: ctx.auth.orgId,
				lastName: validated.lastName as string,
				firstName: validated.firstName as string
			});

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
			const { id, groupId: nextGroupId } = validated as { id: string; groupId?: string | null };
			const currentRecord = await ctx.store.findOne<{
				group_id: string | null;
				last_name: string;
				first_name: string;
			}>(entity.table, ctx.auth.orgId, { id });

			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResourceForGroup(currentRecord?.group_id),
				AUDIT_RESOURCE,
				id
			);

			if (nextGroupId !== undefined) {
				await requireFeaturePolicy(
					ctx,
					POLICY_ACTION_CATALOG.personnel.manageRecords,
					policyResourceForGroup(nextGroupId),
					AUDIT_RESOURCE,
					id
				);
			}

			const dbData = entity.toDbUpdate(validated);
			if (nextGroupId !== undefined) {
				dbData.group_id = nextGroupId || null;
			}
			if (validated.lastName !== undefined || validated.firstName !== undefined) {
				dbData.slug = await buildUniquePersonnelSlug({
					store: ctx.store,
					orgId: ctx.auth.orgId,
					excludePersonnelId: id,
					lastName: (validated.lastName as string | undefined) ?? currentRecord?.last_name ?? '',
					firstName: (validated.firstName as string | undefined) ?? currentRecord?.first_name ?? ''
				});
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

			const directArchiveDecision = await evaluateFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.archiveRecords,
				policyResourceForGroup(currentRecord?.group_id)
			);
			if (!directArchiveDecision.allowed && directArchiveDecision.reasonCode === 'denied:missing-capability') {
				return { requiresApproval: true };
			}
			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.archiveRecords,
				policyResourceForGroup(currentRecord?.group_id),
				AUDIT_RESOURCE,
				id
			);

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
