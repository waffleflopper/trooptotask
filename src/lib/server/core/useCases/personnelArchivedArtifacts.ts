import type { PersonnelArchivedArtifact } from '$features/personnel/personnel-detail.types';
import type { UseCaseContext } from '$lib/server/core/ports';
import { listPersonnelCounselingRecords } from './personnelCounselingRecords';
import { listPersonnelDocuments } from './personnelDocuments';
import { listPersonnelFollowUps } from './personnelFollowUps';
import {
	archiveLeaderNotesWithPersonnel,
	listPersonnelLeaderNotes,
	restoreLeaderNotesWithPersonnel
} from '$features/personnel/index.server';
import type { LeaderNoteArchivePersistence, LeaderNoteContext } from '$features/personnel/index.server';
import { personnelOwnedArchiveSpecs } from './personnelArtifactLifecycle';

const ARCHIVE_UPDATE_BATCH_SIZE = 50;

/** Bind the existing authorized cascade to Personnel's narrow note persistence. */
function noteArchivePersistence(ctx: Pick<UseCaseContext, 'store' | 'auth'>): LeaderNoteArchivePersistence {
	const orgId = ctx.auth.orgId;
	return {
		findActive: (personnelIds) =>
			ctx.store.findMany<{ id: string }>('leader_notes', orgId, undefined, {
				inFilters: { personnel_id: personnelIds },
				isNull: { archived_at: true },
				select: 'id'
			}),
		findArchivedWithPersonnel: (personnelIds, archivedAt) =>
			ctx.store.findMany<{ id: string }>(
				'leader_notes',
				orgId,
				{ archived_at: archivedAt },
				{
					inFilters: { personnel_id: personnelIds },
					select: 'id'
				}
			),
		async setArchivedAt(noteId, archivedAt) {
			await ctx.store.update('leader_notes', orgId, noteId, { archived_at: archivedAt });
		}
	};
}

export async function archivePersonnelOwnedArtifacts(
	ctx: Pick<UseCaseContext, 'store' | 'auth'>,
	personnelIds: string[],
	archivedAt: string
): Promise<void> {
	const uniquePersonnelIds = [...new Set(personnelIds)];
	if (uniquePersonnelIds.length === 0) return;

	for (const { table, filters, archivePatch } of personnelOwnedArchiveSpecs()) {
		const rows = await ctx.store.findMany<{ id: string }>(table, ctx.auth.orgId, filters, {
			inFilters: { personnel_id: uniquePersonnelIds },
			isNull: { archived_at: true },
			select: 'id'
		});

		for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
			const batch = rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE);
			await Promise.all(batch.map((row) => ctx.store.update(table, ctx.auth.orgId, row.id, archivePatch(archivedAt))));
		}
	}
	await archiveLeaderNotesWithPersonnel(noteArchivePersistence(ctx), uniquePersonnelIds, archivedAt);
}

export async function restorePersonnelOwnedArtifacts(
	ctx: Pick<UseCaseContext, 'store' | 'auth'>,
	personnelIds: string[],
	personnelArchivedAt: string
): Promise<void> {
	const uniquePersonnelIds = [...new Set(personnelIds)];
	if (uniquePersonnelIds.length === 0) return;

	for (const { table, restoreFilters, restorePatch } of personnelOwnedArchiveSpecs()) {
		const rows = await ctx.store.findMany<{ id: string }>(table, ctx.auth.orgId, restoreFilters(personnelArchivedAt), {
			inFilters: { personnel_id: uniquePersonnelIds },
			select: 'id'
		});

		for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
			const batch = rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE);
			await Promise.all(batch.map((row) => ctx.store.update(table, ctx.auth.orgId, row.id, restorePatch())));
		}
	}
	await restoreLeaderNotesWithPersonnel(noteArchivePersistence(ctx), uniquePersonnelIds, personnelArchivedAt);
}

export async function listPersonnelArchivedArtifacts(
	ctx: UseCaseContext,
	noteContext: LeaderNoteContext,
	personnelId: string
): Promise<PersonnelArchivedArtifact[]> {
	const [followUps, counselings, documents, notes] = await Promise.all([
		listPersonnelFollowUps(ctx, personnelId, undefined, { archived: true }),
		listPersonnelCounselingRecords(ctx, personnelId, undefined, { archived: true }),
		listPersonnelDocuments(ctx, personnelId, undefined, { archived: true }),
		listPersonnelLeaderNotes(noteContext, personnelId, undefined, { archived: true })
	]);

	return [
		...followUps.map((record) => ({ ...record, kind: 'follow-up' as const })),
		...counselings.map((record) => ({ ...record, kind: 'counseling' as const, archivedAt: record.archivedAt ?? null })),
		...documents.map((record) => ({ ...record, kind: 'document' as const, archivedAt: record.archivedAt ?? null })),
		...notes.map((record) => ({ ...record, kind: 'note' as const, archivedAt: record.archivedAt ?? null }))
	].sort((a, b) => artifactArchivedAt(b).localeCompare(artifactArchivedAt(a)));
}

function artifactArchivedAt(record: PersonnelArchivedArtifact): string {
	if (record.kind === 'follow-up') return record.archivedAt ?? record.updatedAt;
	return record.archivedAt ?? record.createdAt;
}
