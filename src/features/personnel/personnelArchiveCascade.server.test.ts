import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { archivePersonnelOwnedArtifacts } from './personnelArchiveCascade.server';

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

describe('Personnel parent archive cascade', () => {
	it('rejects a mixed-Group archive batch before changing any artifact', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: 'alpha' },
			{ id: 'person-2', organization_id: ctx.auth.orgId, group_id: 'bravo' }
		]);
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				status: 'open',
				archived_at: null
			},
			{
				id: 'follow-up-2',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-2',
				status: 'open',
				archived_at: null
			}
		]);

		await expect(
			archivePersonnelOwnedArtifacts(ctx, ['person-1', 'person-2'], '2026-09-26T00:00:00Z')
		).rejects.toMatchObject({ status: 403 });
		const rows = await ctx.rawStore.findMany<{ archived_at: string | null }>('personnel_follow_ups', ctx.auth.orgId);
		expect(rows.map((row) => row.archived_at)).toEqual([null, null]);
	});

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
});
