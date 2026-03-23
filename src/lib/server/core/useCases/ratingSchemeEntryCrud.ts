import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import type { UseCaseContext } from '$lib/server/core/ports';
import { notifyAdminsViaStore } from './notifyAdminsHelper';

function fail(status: number, message: string): never {
	const err = new Error(message);
	(err as unknown as Record<string, unknown>).status = status;
	throw err;
}

const entity = RatingSchemeEntryEntity;
const AUDIT_RESOURCE = 'rating_scheme';

/** Coerce empty strings to null for optional fields */
function coerceEmptyStrings(data: Record<string, unknown>): Record<string, unknown> {
	const result = { ...data };
	for (const key of Object.keys(result)) {
		if (result[key] === '') result[key] = null;
	}
	return result;
}

export interface RatingSchemeEntryUseCases {
	create(ctx: UseCaseContext, data: Record<string, unknown>): Promise<unknown>;
	update(ctx: UseCaseContext, data: Record<string, unknown>): Promise<unknown>;
	remove(ctx: UseCaseContext, id: string): Promise<{ requiresApproval: boolean } | void>;
}

export function createRatingSchemeEntryUseCases(): RatingSchemeEntryUseCases {
	return {
		async create(ctx, data) {
			ctx.auth.requireEdit('personnel');

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			const validated = entity.createSchema.parse(data);

			if (validated.ratedPersonId && typeof validated.ratedPersonId === 'string') {
				await ctx.auth.requireGroupAccess(validated.ratedPersonId);
			}

			const dbData = coerceEmptyStrings(entity.toDbInsert(validated, ctx.auth.orgId));
			const row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData, entity.select);

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

			await ctx.auth.requireGroupAccessByRecord(entity.table, id, 'rated_person_id');

			const dbData = coerceEmptyStrings(entity.toDbUpdate(validated));
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

		async remove(ctx, id) {
			ctx.auth.requireEdit('personnel');

			const isReadOnly = await ctx.readOnlyGuard.check();
			if (isReadOnly) {
				fail(403, 'Organization is in read-only mode');
			}

			await ctx.auth.requireGroupAccessByRecord(entity.table, id, 'rated_person_id');

			// Non-privileged, non-full-editor users need deletion approval
			if (!ctx.auth.isPrivileged && !ctx.auth.isFullEditor) {
				return { requiresApproval: true };
			}

			await ctx.store.delete(entity.table, ctx.auth.orgId, id);

			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.deleted`,
				resourceType: AUDIT_RESOURCE,
				resourceId: id
			});

			await notifyAdminsViaStore(ctx.store, ctx.auth.orgId, ctx.auth.userId, {
				type: 'config_type_deleted',
				title: 'Rating Scheme Entry Deleted',
				message: 'A rating scheme entry was deleted.'
			});
		}
	};
}
