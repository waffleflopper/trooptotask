import { testPersonnelArtifactsContext } from './personnelArtifacts.testHelper';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { testLeaderNoteContext } from '$features/personnel/leaderNotes.testHelper';
import { listPersonnelArchivedArtifacts } from './personnelArchivedArtifacts.server';
import {
	archivePersonnelFollowUp,
	deletePersonnelFollowUp,
	restorePersonnelFollowUp,
	setPersonnelFollowUpStatus
} from './personnelFollowUps.server';
import {
	archivePersonnelCounselingRecord,
	deletePersonnelCounselingRecord,
	restorePersonnelCounselingRecord
} from './personnelCounselingRecords.server';
import {
	archivePersonnelDocument,
	deletePersonnelDocument,
	restorePersonnelDocument
} from './personnelDocuments.server';
import {
	archivePersonnelLeaderNote,
	deletePersonnelLeaderNote,
	restorePersonnelLeaderNote
} from '$features/personnel/index.server';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: null,
			rank: 'SGT',
			last_name: 'Rivera',
			first_name: 'Monica'
		}
	]);
}

function seedActiveAndArchivedArtifacts(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel_follow_ups', [
		{
			id: 'follow-up-active',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			title: 'Active follow-up',
			notes: null,
			due_date: null,
			status: 'open',
			created_by: 'test-user',
			created_at: '2026-05-01T08:00:00Z',
			updated_at: '2026-05-01T08:00:00Z',
			completed_at: null,
			archived_at: null
		},
		{
			id: 'follow-up-archived',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			title: 'Archived follow-up',
			notes: null,
			due_date: null,
			status: 'archived',
			created_by: 'test-user',
			created_at: '2026-05-01T09:00:00Z',
			updated_at: '2026-05-02T10:00:00Z',
			completed_at: null,
			archived_at: '2026-05-02T10:00:00Z'
		},
		{
			id: 'follow-up-completed',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			title: 'Completed follow-up',
			notes: null,
			due_date: null,
			status: 'completed',
			created_by: 'test-user',
			created_at: '2026-05-01T10:00:00Z',
			updated_at: '2026-05-01T10:00:00Z',
			completed_at: '2026-05-01T10:00:00Z',
			archived_at: null
		}
	]);
	ctx.store.seed('counseling_records', [
		{
			id: 'counseling-active',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			date_conducted: '2026-05-01',
			title: 'Active counseling',
			file_path: 'test-org/counseling-records/person-1/active.pdf',
			uploaded_by: 'test-user',
			created_at: '2026-05-01T10:00:00Z',
			archived_at: null
		},
		{
			id: 'counseling-archived',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			date_conducted: '2026-05-02',
			title: 'Archived counseling',
			file_path: 'test-org/counseling-records/person-1/archived.pdf',
			uploaded_by: 'test-user',
			created_at: '2026-05-02T09:00:00Z',
			archived_at: '2026-05-03T10:00:00Z'
		}
	]);
	ctx.store.seed('personnel_documents', [
		{
			id: 'document-active',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			title: 'Active document',
			file_path: 'test-org/personnel/person-1/documents/active.pdf',
			file_size_bytes: 500,
			content_type: 'application/pdf',
			uploaded_by: 'test-user',
			created_at: '2026-05-01T10:00:00Z',
			archived_at: null
		},
		{
			id: 'document-archived',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			title: 'Archived document',
			file_path: 'test-org/personnel/person-1/documents/archived.pdf',
			file_size_bytes: 600,
			content_type: 'application/pdf',
			uploaded_by: 'test-user',
			created_at: '2026-05-03T09:00:00Z',
			archived_at: '2026-05-04T10:00:00Z'
		}
	]);
	ctx.store.seed('leader_notes', [
		{
			id: 'note-active',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			author: 'test-user',
			text: 'Active note',
			created_at: '2026-05-01T10:00:00Z',
			archived_at: null
		},
		{
			id: 'note-archived',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			author: 'test-user',
			text: 'Archived note',
			created_at: '2026-05-04T09:00:00Z',
			archived_at: '2026-05-05T10:00:00Z'
		}
	]);
}

describe('personnel archived artifacts', () => {
	it('lists only archived artifacts across follow-ups, counselings, documents, and notes', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedActiveAndArchivedArtifacts(ctx);

		const artifacts = await listPersonnelArchivedArtifacts(
			testPersonnelArtifactsContext(ctx),
			testLeaderNoteContext(ctx),
			'person-1'
		);

		expect(artifacts.map((artifact) => `${artifact.kind}:${artifact.id}`)).toEqual([
			'note:note-archived',
			'document:document-archived',
			'counseling:counseling-archived',
			'follow-up:follow-up-archived'
		]);
		expect(artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'follow-up', id: 'follow-up-archived', archivedAt: '2026-05-02T10:00:00Z' }),
				expect.objectContaining({ kind: 'counseling', id: 'counseling-archived', archivedAt: '2026-05-03T10:00:00Z' }),
				expect.objectContaining({ kind: 'document', id: 'document-archived', archivedAt: '2026-05-04T10:00:00Z' }),
				expect.objectContaining({ kind: 'note', id: 'note-archived', archivedAt: '2026-05-05T10:00:00Z' })
			])
		);
		expect(artifacts.map((artifact) => artifact.id)).not.toEqual(
			expect.arrayContaining(['follow-up-active', 'counseling-active', 'document-active', 'note-active'])
		);
	});

	it('enforces archived-only delete constraints for each artifact type', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedActiveAndArchivedArtifacts(ctx);

		await expect(
			deletePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				followUpId: 'follow-up-active'
			})
		).rejects.toMatchObject({ status: 409 });
		await expect(
			deletePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				recordId: 'counseling-active'
			})
		).rejects.toMatchObject({ status: 409 });
		await expect(
			deletePersonnelDocument(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				documentId: 'document-active'
			})
		).rejects.toMatchObject({ status: 409 });
		await expect(
			deletePersonnelLeaderNote(testLeaderNoteContext(ctx), { personnelId: 'person-1', noteId: 'note-active' })
		).rejects.toMatchObject({ status: 409 });

		await deletePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			followUpId: 'follow-up-archived'
		});
		await deletePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			recordId: 'counseling-archived'
		});
		await deletePersonnelDocument(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			documentId: 'document-archived'
		});
		await deletePersonnelLeaderNote(testLeaderNoteContext(ctx), { personnelId: 'person-1', noteId: 'note-archived' });

		await expect(
			listPersonnelArchivedArtifacts(testPersonnelArtifactsContext(ctx), testLeaderNoteContext(ctx), 'person-1')
		).resolves.toHaveLength(0);
	});

	it('restores archived artifacts for each artifact type', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedActiveAndArchivedArtifacts(ctx);

		await expect(
			restorePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				followUpId: 'follow-up-archived'
			})
		).resolves.toMatchObject({ id: 'follow-up-archived', status: 'open', archivedAt: null });
		await expect(
			restorePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				recordId: 'counseling-archived'
			})
		).resolves.toEqual({ id: 'counseling-archived', archivedAt: null });
		await expect(
			restorePersonnelDocument(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				documentId: 'document-archived'
			})
		).resolves.toMatchObject({ id: 'document-archived', archivedAt: null });
		await expect(
			restorePersonnelLeaderNote(testLeaderNoteContext(ctx), { personnelId: 'person-1', noteId: 'note-archived' })
		).resolves.toMatchObject({ id: 'note-archived', archivedAt: null });

		await expect(
			listPersonnelArchivedArtifacts(testPersonnelArtifactsContext(ctx), testLeaderNoteContext(ctx), 'person-1')
		).resolves.toHaveLength(0);
	});

	it('sorts archived follow-ups by archive timestamp instead of update timestamp', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-old-archive',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				title: 'Old archive but recently edited',
				notes: null,
				due_date: null,
				status: 'archived',
				created_by: 'test-user',
				created_at: '2026-05-01T00:00:00Z',
				updated_at: '2026-05-20T00:00:00Z',
				completed_at: null,
				archived_at: '2026-05-02T00:00:00Z'
			},
			{
				id: 'follow-up-new-archive',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				title: 'New archive',
				notes: null,
				due_date: null,
				status: 'archived',
				created_by: 'test-user',
				created_at: '2026-05-01T00:00:00Z',
				updated_at: '2026-05-03T00:00:00Z',
				completed_at: null,
				archived_at: '2026-05-10T00:00:00Z'
			}
		]);

		const artifacts = await listPersonnelArchivedArtifacts(
			testPersonnelArtifactsContext(ctx),
			testLeaderNoteContext(ctx),
			'person-1'
		);

		expect(artifacts.map((artifact) => artifact.id)).toEqual(['follow-up-new-archive', 'follow-up-old-archive']);
	});
});

describe('personnel artifact lifecycle responses', () => {
	const personnelOperator = {
		role: 'member' as const,
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none' as const,
			personnel: 'operate' as const,
			training: 'none' as const,
			criticalTasks: 'none' as const,
			onboarding: 'none' as const,
			ratingScheme: 'none' as const
		}
	};

	it('return only lifecycle state to Personnel operators who cannot read sensitive records', async () => {
		const ctx = createTestContext({ auth: personnelOperator });
		seedPersonnel(ctx);
		seedActiveAndArchivedArtifacts(ctx);
		const artifacts = testPersonnelArtifactsContext(ctx);
		const notes = testLeaderNoteContext(ctx);

		await expect(
			archivePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: 'note-active' })
		).resolves.toEqual({ id: 'note-active', archivedAt: expect.any(String) });
		await expect(
			restorePersonnelLeaderNote(notes, { personnelId: 'person-1', noteId: 'note-archived' })
		).resolves.toEqual({ id: 'note-archived', archivedAt: null });
		await expect(
			archivePersonnelCounselingRecord(artifacts, { personnelId: 'person-1', recordId: 'counseling-active' })
		).resolves.toEqual({ id: 'counseling-active', archivedAt: expect.any(String) });
		await expect(
			restorePersonnelCounselingRecord(artifacts, { personnelId: 'person-1', recordId: 'counseling-archived' })
		).resolves.toEqual({ id: 'counseling-archived', archivedAt: null });
		await expect(
			archivePersonnelDocument(artifacts, { personnelId: 'person-1', documentId: 'document-active' })
		).resolves.toEqual({ id: 'document-active', archivedAt: expect.any(String) });
		await expect(
			restorePersonnelDocument(artifacts, { personnelId: 'person-1', documentId: 'document-archived' })
		).resolves.toEqual({ id: 'document-archived', archivedAt: null });
		await expect(
			setPersonnelFollowUpStatus(artifacts, {
				personnelId: 'person-1',
				followUpId: 'follow-up-active',
				status: 'completed'
			})
		).resolves.toEqual({ id: 'follow-up-active', status: 'completed', archivedAt: null });
		await expect(
			archivePersonnelFollowUp(artifacts, { personnelId: 'person-1', followUpId: 'follow-up-active' })
		).resolves.toEqual({ id: 'follow-up-active', status: 'archived', archivedAt: expect.any(String) });
		await expect(
			restorePersonnelFollowUp(artifacts, { personnelId: 'person-1', followUpId: 'follow-up-archived' })
		).resolves.toEqual({ id: 'follow-up-archived', status: 'open', archivedAt: null });
	});

	it('return the full follow-up to sensitive-record readers so their follow-up list refreshes', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedActiveAndArchivedArtifacts(ctx);

		await expect(
			restorePersonnelFollowUp(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				followUpId: 'follow-up-archived'
			})
		).resolves.toMatchObject({
			id: 'follow-up-archived',
			title: 'Archived follow-up',
			status: 'open',
			archivedAt: null
		});
	});
});
