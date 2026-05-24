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
import type { WriteWithNotificationsPorts, WriteWithSubscriptionPorts } from '$lib/server/core/ports';
import { evaluateFeaturePolicy, policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';
import { buildUniquePersonnelSlug, isPersonnelSlugUniqueConstraintError } from './personnelSlug';
import { createDeletionRequest } from './deletionRequests';

const entity = PersonnelEntity;
const AUDIT_RESOURCE = 'personnel';
const SLUG_RETRY_LIMIT = 3;

type ArchiveBatchPorts = WriteWithSubscriptionPorts & WriteWithNotificationsPorts;

export interface ArchivePersonnelBatchInput {
	ids: string[];
	userEmail: string;
}

export interface ArchivePersonnelBatchResult {
	archivedIds: string[];
	approvalRequestedIds: string[];
	errors: Array<{ id: string; message: string }>;
}

interface ArchiveCandidate {
	id: string;
	rank: string;
	first_name: string;
	last_name: string;
	group_id: string | null;
	archived_at: string | null;
}

export interface PersonnelUseCases {
	create(ctx: WriteWithSubscriptionPorts, data: Record<string, unknown>): Promise<unknown>;
	update(ctx: WriteWithSubscriptionPorts, data: Record<string, unknown>): Promise<unknown>;
	archive(ctx: WriteWithSubscriptionPorts, id: string): Promise<{ requiresApproval: boolean } | void>;
	archiveBatch(ctx: ArchiveBatchPorts, input: ArchivePersonnelBatchInput): Promise<ArchivePersonnelBatchResult>;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}

function resourceDescription(person: ArchiveCandidate): string {
	return `Archive ${person.rank} ${person.last_name}, ${person.first_name}`;
}

function errorStatus(error: unknown): number | undefined {
	return typeof error === 'object' && error !== null && 'status' in error
		? (error as { status?: number }).status
		: undefined;
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
			let row: Record<string, unknown> | null = null;
			for (let attempt = 1; attempt <= SLUG_RETRY_LIMIT; attempt += 1) {
				dbData.slug = await buildUniquePersonnelSlug({
					store: ctx.rawStore ?? ctx.store,
					orgId: ctx.auth.orgId,
					lastName: validated.lastName as string,
					firstName: validated.firstName as string
				});

				try {
					row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData, entity.select);
					break;
				} catch (error) {
					if (attempt === SLUG_RETRY_LIMIT || !isPersonnelSlugUniqueConstraintError(error)) throw error;
				}
			}

			if (!row) fail(500, 'Unable to create personnel record.');

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
			const shouldRegenerateSlug = validated.lastName !== undefined || validated.firstName !== undefined;
			let row: Record<string, unknown> | null = null;
			for (let attempt = 1; attempt <= SLUG_RETRY_LIMIT; attempt += 1) {
				if (shouldRegenerateSlug) {
					dbData.slug = await buildUniquePersonnelSlug({
						store: ctx.rawStore ?? ctx.store,
						orgId: ctx.auth.orgId,
						excludePersonnelId: id,
						lastName: (validated.lastName as string | undefined) ?? currentRecord?.last_name ?? '',
						firstName: (validated.firstName as string | undefined) ?? currentRecord?.first_name ?? ''
					});
				}

				try {
					row = await ctx.store.update<Record<string, unknown>>(
						entity.table,
						ctx.auth.orgId,
						id,
						dbData,
						entity.select
					);
					break;
				} catch (error) {
					if (!shouldRegenerateSlug || attempt === SLUG_RETRY_LIMIT || !isPersonnelSlugUniqueConstraintError(error)) {
						throw error;
					}
				}
			}

			if (!row) fail(500, 'Unable to update personnel record.');

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
				id,
				{ enforceReadOnlyOverlay: false }
			);

			const directArchiveDecision = await evaluateFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.archiveRecords,
				policyResourceForGroup(currentRecord?.group_id),
				{ enforceReadOnlyOverlay: false }
			);
			if (!directArchiveDecision.allowed && directArchiveDecision.reasonCode === 'denied:missing-capability') {
				return { requiresApproval: true };
			}
			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.archiveRecords,
				policyResourceForGroup(currentRecord?.group_id),
				AUDIT_RESOURCE,
				id,
				{ enforceReadOnlyOverlay: false }
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
		},

		async archiveBatch(ctx, input) {
			const ids = uniqueStrings(input.ids);
			if (ids.length === 0) {
				return { archivedIds: [], approvalRequestedIds: [], errors: [] };
			}

			const candidates = await ctx.store.findMany<ArchiveCandidate>(entity.table, ctx.auth.orgId, undefined, {
				inFilters: { id: ids },
				select: 'id, rank, first_name, last_name, group_id, archived_at'
			});
			const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
			const result: ArchivePersonnelBatchResult = {
				archivedIds: [],
				approvalRequestedIds: [],
				errors: []
			};

			const archivedAt = new Date().toISOString();

			for (const id of ids) {
				const person = candidateById.get(id);
				if (!person) {
					result.errors.push({ id, message: 'Personnel not found' });
					continue;
				}

				if (person.archived_at) {
					result.errors.push({ id, message: 'Personnel is already archived' });
					continue;
				}

				await requireFeaturePolicy(
					ctx,
					POLICY_ACTION_CATALOG.personnel.manageRecords,
					policyResourceForGroup(person.group_id),
					AUDIT_RESOURCE,
					id,
					{ enforceReadOnlyOverlay: false }
				);

				const directArchiveDecision = await evaluateFeaturePolicy(
					ctx,
					POLICY_ACTION_CATALOG.personnel.archiveRecords,
					policyResourceForGroup(person.group_id),
					{ enforceReadOnlyOverlay: false }
				);

				if (!directArchiveDecision.allowed && directArchiveDecision.reasonCode === 'denied:missing-capability') {
					try {
						await createDeletionRequest(ctx, {
							resourceType: AUDIT_RESOURCE,
							resourceId: id,
							resourceDescription: resourceDescription(person),
							resourceUrl: `/org/${ctx.auth.orgId}/personnel`,
							userEmail: input.userEmail
						});
						result.approvalRequestedIds.push(id);
					} catch (error) {
						if (errorStatus(error) === 409) {
							result.approvalRequestedIds.push(id);
						} else {
							result.errors.push({
								id,
								message: error instanceof Error ? error.message : 'Failed to submit archival request'
							});
						}
					}
					continue;
				}

				await requireFeaturePolicy(
					ctx,
					POLICY_ACTION_CATALOG.personnel.archiveRecords,
					policyResourceForGroup(person.group_id),
					AUDIT_RESOURCE,
					id,
					{ enforceReadOnlyOverlay: false }
				);

				await ctx.store.update(entity.table, ctx.auth.orgId, id, { archived_at: archivedAt });
				result.archivedIds.push(id);
			}

			if (result.archivedIds.length > 0) {
				ctx.subscription.invalidateTierCache();
				ctx.audit.log({
					action: `${AUDIT_RESOURCE}.bulk_archived`,
					resourceType: AUDIT_RESOURCE,
					details: {
						count: result.archivedIds.length,
						ids: result.archivedIds
					}
				});
			}

			return result;
		}
	};
}
