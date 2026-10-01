/**
 * Personnel lifecycle use cases — archive, restore, and permanent delete.
 *
 * Personnel lifecycle operations use scoped writes and artifact lifecycle handling.
 * Archive requests approval when the actor cannot archive directly.
 *
 * Single-record creation and editing are owned by the Personnel feature.
 * For bulk import, see Personnel-owned `personnelBatch.server.ts`. The workspace roster is loaded
 * through `personnelWorkspaceQuery.ts`.
 */
import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { PersonnelEntity } from '$features/personnel/index.server';
import type { WriteWithNotificationsPorts, WritePorts } from '$lib/server/core/ports';
import { evaluateFeaturePolicy, policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';
import { createDeletionRequest } from './deletionRequests';
import { archivePersonnelOwnedArtifacts, restorePersonnelOwnedArtifacts } from './personnelArchivedArtifacts';

const entity = PersonnelEntity;
const AUDIT_RESOURCE = 'personnel';

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

interface PersonnelLifecycleRecord {
	rank: string;
	first_name: string;
	last_name: string;
	group_id: string | null;
	archived_at: string | null;
}

export interface PersonnelUseCases {
	archive(ctx: WritePorts, id: string): Promise<{ requiresApproval: boolean } | void>;
	archiveBatch(
		ctx: WriteWithNotificationsPorts,
		input: ArchivePersonnelBatchInput
	): Promise<ArchivePersonnelBatchResult>;
	restore(ctx: WritePorts, id: string): Promise<{ success: true }>;
	permanentlyDelete(ctx: WriteWithNotificationsPorts, id: string): Promise<{ success: true }>;
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

function lifecycleLookupStore(ctx: { store: WritePorts['store']; rawStore?: WritePorts['store'] }) {
	return ctx.rawStore ?? ctx.store;
}

function personnelName(person: Pick<PersonnelLifecycleRecord, 'rank' | 'last_name' | 'first_name'>): string {
	return `${person.rank} ${person.last_name}, ${person.first_name}`;
}

export function createPersonnelUseCases(): PersonnelUseCases {
	return {
		async archive(ctx, id) {
			const currentRecord = await lifecycleLookupStore(ctx).findOne<{
				group_id: string | null;
				archived_at: string | null;
			}>(entity.table, ctx.auth.orgId, { id });

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

			const archivedAt = currentRecord?.archived_at ?? new Date().toISOString();
			if (!currentRecord?.archived_at) {
				await ctx.store.update(entity.table, ctx.auth.orgId, id, { archived_at: archivedAt });
			}
			// A retry completes only remaining active artifacts under the original event.
			await archivePersonnelOwnedArtifacts(ctx, [id], archivedAt);

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
					id
				);

				const directArchiveDecision = await evaluateFeaturePolicy(
					ctx,
					POLICY_ACTION_CATALOG.personnel.archiveRecords,
					policyResourceForGroup(person.group_id)
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
					id
				);

				await ctx.store.update(entity.table, ctx.auth.orgId, id, { archived_at: archivedAt });
				result.archivedIds.push(id);
			}

			if (result.archivedIds.length > 0) {
				await archivePersonnelOwnedArtifacts(ctx, result.archivedIds, archivedAt);
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
		},

		async restore(ctx, id) {
			if (!id) fail(400, 'Missing id');

			const person = await lifecycleLookupStore(ctx).findOne<PersonnelLifecycleRecord>(entity.table, ctx.auth.orgId, {
				id
			});

			if (!person) fail(404, 'Personnel not found');

			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.restoreRecords,
				policyResourceForGroup(person.group_id),
				AUDIT_RESOURCE,
				id
			);

			if (!person.archived_at) fail(400, 'Personnel is not archived');

			const personnelArchivedAt = person.archived_at;
			await ctx.store.update(entity.table, ctx.auth.orgId, id, { archived_at: null });
			await restorePersonnelOwnedArtifacts(ctx, [id], personnelArchivedAt);

			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.restored`,
				resourceType: AUDIT_RESOURCE,
				resourceId: id,
				details: {
					name: personnelName(person)
				}
			});

			return { success: true };
		},

		async permanentlyDelete(ctx, id) {
			if (!id) fail(400, 'Missing id');

			const person = await lifecycleLookupStore(ctx).findOne<PersonnelLifecycleRecord>(entity.table, ctx.auth.orgId, {
				id
			});

			if (!person) fail(404, 'Personnel not found');

			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
				policyResourceForGroup(person.group_id),
				AUDIT_RESOURCE,
				id
			);

			if (!person.archived_at) fail(400, 'Can only permanently delete archived personnel');

			await ctx.store.delete(entity.table, ctx.auth.orgId, id);

			const name = personnelName(person);

			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.permanently_deleted`,
				resourceType: AUDIT_RESOURCE,
				resourceId: id,
				details: { name }
			});

			await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
				type: 'personnel_permanently_deleted',
				title: 'Personnel Permanently Deleted',
				message: `Personnel "${name}" was permanently deleted.`
			});

			return { success: true };
		}
	};
}
