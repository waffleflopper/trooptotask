import { describe, expect, expectTypeOf, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	archivePersonnelOwnedArtifacts,
	deletePersonnelArchivedArtifact,
	listPersonnelArchivedArtifacts,
	restorePersonnelArchivedArtifact,
	type RestoredPersonnelArchivedArtifact
} from './personnelArchivedArtifacts';

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
	it('archives active personnel-owned artifacts without resetting existing archive timestamps', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedActiveAndArchivedArtifacts(ctx);

		await archivePersonnelOwnedArtifacts(ctx, ['person-1'], '2026-05-30T12:00:00Z');

		const followUps = await ctx.store.findMany<Record<string, unknown>>('personnel_follow_ups', ctx.auth.orgId);
		const counselings = await ctx.store.findMany<Record<string, unknown>>('counseling_records', ctx.auth.orgId);
		const documents = await ctx.store.findMany<Record<string, unknown>>('personnel_documents', ctx.auth.orgId);
		const notes = await ctx.store.findMany<Record<string, unknown>>('leader_notes', ctx.auth.orgId);

		expect(followUps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'follow-up-active',
					status: 'archived',
					archived_at: '2026-05-30T12:00:00Z'
				}),
				expect.objectContaining({
					id: 'follow-up-archived',
					status: 'archived',
					archived_at: '2026-05-02T10:00:00Z'
				}),
				expect.objectContaining({
					id: 'follow-up-completed',
					status: 'completed',
					archived_at: null
				})
			])
		);
		expect(counselings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'counseling-active', archived_at: '2026-05-30T12:00:00Z' }),
				expect.objectContaining({ id: 'counseling-archived', archived_at: '2026-05-03T10:00:00Z' })
			])
		);
		expect(documents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'document-active', archived_at: '2026-05-30T12:00:00Z' }),
				expect.objectContaining({ id: 'document-archived', archived_at: '2026-05-04T10:00:00Z' })
			])
		);
		expect(notes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'note-active', archived_at: '2026-05-30T12:00:00Z' }),
				expect.objectContaining({ id: 'note-archived', archived_at: '2026-05-05T10:00:00Z' })
			])
		);
	});

	it('lists only archived artifacts across follow-ups, counselings, documents, and notes', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedActiveAndArchivedArtifacts(ctx);

		const artifacts = await listPersonnelArchivedArtifacts(ctx, 'person-1');

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
			deletePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'follow-up', id: 'follow-up-active' })
		).rejects.toMatchObject({ status: 409 });
		await expect(
			deletePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'counseling', id: 'counseling-active' })
		).rejects.toMatchObject({ status: 409 });
		await expect(
			deletePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'document', id: 'document-active' })
		).rejects.toMatchObject({ status: 409 });
		await expect(
			deletePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'note', id: 'note-active' })
		).rejects.toMatchObject({ status: 409 });

		await deletePersonnelArchivedArtifact(ctx, {
			personnelId: 'person-1',
			kind: 'follow-up',
			id: 'follow-up-archived'
		});
		await deletePersonnelArchivedArtifact(ctx, {
			personnelId: 'person-1',
			kind: 'counseling',
			id: 'counseling-archived'
		});
		await deletePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'document', id: 'document-archived' });
		await deletePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'note', id: 'note-archived' });

		await expect(listPersonnelArchivedArtifacts(ctx, 'person-1')).resolves.toHaveLength(0);
	});

	it('restores archived artifacts for each artifact type', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		seedActiveAndArchivedArtifacts(ctx);

		await expect(
			restorePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'follow-up', id: 'follow-up-archived' })
		).resolves.toMatchObject({ kind: 'follow-up', id: 'follow-up-archived', status: 'open', archivedAt: null });
		await expect(
			restorePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'counseling', id: 'counseling-archived' })
		).resolves.toMatchObject({ kind: 'counseling', id: 'counseling-archived', status: 'uploaded', archivedAt: null });
		await expect(
			restorePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'document', id: 'document-archived' })
		).resolves.toMatchObject({ kind: 'document', id: 'document-archived', archivedAt: null });
		await expect(
			restorePersonnelArchivedArtifact(ctx, { personnelId: 'person-1', kind: 'note', id: 'note-archived' })
		).resolves.toMatchObject({ kind: 'note', id: 'note-archived', archivedAt: null });

		await expect(listPersonnelArchivedArtifacts(ctx, 'person-1')).resolves.toHaveLength(0);
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

		const artifacts = await listPersonnelArchivedArtifacts(ctx, 'person-1');

		expect(artifacts.map((artifact) => artifact.id)).toEqual(['follow-up-new-archive', 'follow-up-old-archive']);
	});

	it('restores archived artifacts with a typed kind-specific result', async () => {
		type RestoreResult = Awaited<ReturnType<typeof restorePersonnelArchivedArtifact>>;
		expectTypeOf<RestoreResult>().toEqualTypeOf<RestoredPersonnelArchivedArtifact>();

		const ctx = createTestContext();
		seedPersonnel(ctx);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				author: 'test-user',
				text: 'Archived note',
				created_at: '2026-05-01T10:00:00Z',
				archived_at: '2026-05-02T10:00:00Z'
			}
		]);

		const restored = await restorePersonnelArchivedArtifact(ctx, {
			personnelId: 'person-1',
			kind: 'note',
			id: 'note-1'
		});

		expect(restored).toMatchObject({
			kind: 'note',
			id: 'note-1',
			personnelId: 'person-1',
			text: 'Archived note',
			archivedAt: null
		});
	});
});
