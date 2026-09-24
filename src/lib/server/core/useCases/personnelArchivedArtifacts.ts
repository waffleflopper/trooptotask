import type { PersonnelLeaderNote } from '$features/personnel/contracts';
import type {
	PersonnelArchivedArtifact,
	PersonnelArtifactKind,
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelFollowUp
} from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	deletePersonnelCounselingRecord,
	listPersonnelCounselingRecords,
	restorePersonnelCounselingRecord
} from './personnelCounselingRecords';
import { deletePersonnelDocument, listPersonnelDocuments, restorePersonnelDocument } from './personnelDocuments';
import { deletePersonnelFollowUp, listPersonnelFollowUps, restorePersonnelFollowUp } from './personnelFollowUps';
import {
	deletePersonnelLeaderNote,
	listPersonnelLeaderNotes,
	restorePersonnelLeaderNote
} from './personnelLeaderNotes';
import { PERSONNEL_ARTIFACT_SPECS, personnelOwnedArchiveSpecs } from './personnelArtifactLifecycle';

const ARCHIVE_UPDATE_BATCH_SIZE = 50;

export type RestoredPersonnelArchivedArtifact =
	| ({ kind: 'follow-up' } & PersonnelFollowUp)
	| ({ kind: 'counseling' } & PersonnelCounselingRecord)
	| ({ kind: 'document' } & PersonnelDocument)
	| ({ kind: 'note' } & PersonnelLeaderNote);

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
}

export async function listPersonnelArchivedArtifacts(
	ctx: UseCaseContext,
	personnelId: string
): Promise<PersonnelArchivedArtifact[]> {
	const [followUps, counselings, documents, notes] = await Promise.all([
		listPersonnelFollowUps(ctx, personnelId, undefined, { archived: true }),
		listPersonnelCounselingRecords(ctx, personnelId, undefined, { archived: true }),
		listPersonnelDocuments(ctx, personnelId, undefined, { archived: true }),
		listPersonnelLeaderNotes(ctx, personnelId, undefined, { archived: true })
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

export async function restorePersonnelArchivedArtifact(
	ctx: UseCaseContext,
	input: { personnelId: string; kind: PersonnelArtifactKind; id: string }
): Promise<RestoredPersonnelArchivedArtifact> {
	const restore = restorePersonnelArchivedArtifactByKind[input.kind];
	if (!restore) fail(400, 'Unknown archived item type');
	return restore(ctx, input);
}

export async function deletePersonnelArchivedArtifact(
	ctx: UseCaseContext,
	input: { personnelId: string; kind: PersonnelArtifactKind; id: string }
): Promise<void> {
	const deleteArtifact = deletePersonnelArchivedArtifactByKind[input.kind];
	if (!deleteArtifact) fail(400, 'Unknown archived item type');
	return deleteArtifact(ctx, input);
}

type ArchivedArtifactInput = { personnelId: string; kind: PersonnelArtifactKind; id: string };
type RestoreArchivedArtifactHandler = (
	ctx: UseCaseContext,
	input: ArchivedArtifactInput
) => Promise<RestoredPersonnelArchivedArtifact>;
type DeleteArchivedArtifactHandler = (ctx: UseCaseContext, input: ArchivedArtifactInput) => Promise<void>;

const restorePersonnelArchivedArtifactByKind = {
	'follow-up': async (ctx, input) => ({
		kind: 'follow-up',
		...(await restorePersonnelFollowUp(ctx, { personnelId: input.personnelId, followUpId: input.id }))
	}),
	counseling: async (ctx, input) => ({
		kind: 'counseling',
		...(await restorePersonnelCounselingRecord(ctx, { personnelId: input.personnelId, recordId: input.id }))
	}),
	document: async (ctx, input) => ({
		kind: 'document',
		...(await restorePersonnelDocument(ctx, { personnelId: input.personnelId, documentId: input.id }))
	}),
	note: async (ctx, input) => ({
		kind: 'note',
		...(await restorePersonnelLeaderNote(ctx, { personnelId: input.personnelId, noteId: input.id }))
	})
} satisfies Record<keyof typeof PERSONNEL_ARTIFACT_SPECS, RestoreArchivedArtifactHandler>;

const deletePersonnelArchivedArtifactByKind = {
	'follow-up': (ctx, input) => deletePersonnelFollowUp(ctx, { personnelId: input.personnelId, followUpId: input.id }),
	counseling: (ctx, input) =>
		deletePersonnelCounselingRecord(ctx, { personnelId: input.personnelId, recordId: input.id }),
	document: (ctx, input) => deletePersonnelDocument(ctx, { personnelId: input.personnelId, documentId: input.id }),
	note: (ctx, input) => deletePersonnelLeaderNote(ctx, { personnelId: input.personnelId, noteId: input.id })
} satisfies Record<keyof typeof PERSONNEL_ARTIFACT_SPECS, DeleteArchivedArtifactHandler>;
