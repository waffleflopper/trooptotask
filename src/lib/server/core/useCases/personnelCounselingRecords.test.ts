import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	archivePersonnelCounselingRecord,
	createPersonnelCounselingRecord,
	deletePersonnelCounselingRecord,
	listPersonnelCounselingRecords,
	restorePersonnelCounselingRecord
} from './personnelCounselingRecords';

const LEADER_USER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_PDF_BYTES = ['%PDF-1.7\nsigned counseling'];

function seedPersonnel(ctx: ReturnType<typeof createTestContext>, groupId: string | null = null) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: groupId
		}
	]);
}

function operateContext() {
	return createTestContext({
		auth: {
			capabilityMap: {
				calendar: 'view',
				personnel: 'operate',
				training: 'view',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			},
			userId: LEADER_USER_ID,
			scopeSet: { kind: 'organization' }
		}
	});
}

describe('personnel counseling records', () => {
	it('uploads a signed counseling PDF and lists records newest first', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);
		ctx.store.seed('counseling_records', [
			{
				id: 'old-record',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				date_conducted: '2026-04-01',
				title: 'Initial counseling',
				summary: 'Baseline expectations.',
				uploaded_by: '1SG',
				file_path: 'org/test-org/personnel/person-1/counseling/old.pdf',
				created_at: '2026-04-02T10:00:00Z'
			}
		]);
		ctx.store.seed('organization_memberships', [
			{
				id: 'membership-1',
				organization_id: ctx.auth.orgId,
				user_id: LEADER_USER_ID,
				email: 'leader@example.com'
			}
		]);
		const file = new File(VALID_PDF_BYTES, 'monthly-counseling.pdf', { type: 'application/pdf' });

		const created = await createPersonnelCounselingRecord(ctx, {
			personnelId: 'person-1',
			dateConducted: '2026-05-10',
			title: 'Monthly counseling',
			summary: 'Reviewed performance and board prep.',
			file
		});
		const records = await listPersonnelCounselingRecords(ctx, 'person-1');

		expect(created).toMatchObject({
			personnelId: 'person-1',
			dateConducted: '2026-05-10',
			title: 'Monthly counseling',
			summary: 'Reviewed performance and board prep.',
			uploadedBy: 'leader@example.com',
			fileName: expect.stringMatching(/monthly-counseling\.pdf$/),
			status: 'uploaded'
		});
		expect(created).not.toHaveProperty('filePath');
		expect((ctx.storage as typeof ctx.storage & { files: unknown[] }).files).toHaveLength(1);
		expect(records.map((record) => record.id)).toEqual([created.id, 'old-record']);
	});

	it('archives, restores, and hard-deletes counseling records only after archive', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);
		ctx.store.seed('counseling_records', [
			{
				id: 'record-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				date_conducted: '2026-04-01',
				title: 'Initial counseling',
				uploaded_by: 'test-user',
				file_path: 'test-org/counseling-records/person-1/record.pdf',
				created_at: '2026-04-02T10:00:00Z',
				archived_at: null
			}
		]);

		const archived = await archivePersonnelCounselingRecord(ctx, { personnelId: 'person-1', recordId: 'record-1' });
		expect(archived.status).toBe('archived');
		await expect(
			archivePersonnelCounselingRecord(ctx, { personnelId: 'person-1', recordId: 'record-1' })
		).rejects.toMatchObject({ status: 409 });
		await expect(listPersonnelCounselingRecords(ctx, 'person-1')).resolves.toHaveLength(0);
		await expect(listPersonnelCounselingRecords(ctx, 'person-1', undefined, { archived: true })).resolves.toHaveLength(
			1
		);

		const restored = await restorePersonnelCounselingRecord(ctx, { personnelId: 'person-1', recordId: 'record-1' });
		expect(restored.status).toBe('uploaded');
		await expect(
			deletePersonnelCounselingRecord(ctx, { personnelId: 'person-1', recordId: 'record-1' })
		).rejects.toMatchObject({
			status: 409
		});

		await archivePersonnelCounselingRecord(ctx, { personnelId: 'person-1', recordId: 'record-1' });
		await deletePersonnelCounselingRecord(ctx, { personnelId: 'person-1', recordId: 'record-1' });
		await expect(listPersonnelCounselingRecords(ctx, 'person-1', undefined, { archived: true })).resolves.toHaveLength(
			0
		);
	});

	it('rejects non-PDF uploads', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);

		await expect(
			createPersonnelCounselingRecord(ctx, {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Image',
				file: new File(['image'], 'scan.png', { type: 'image/png' })
			})
		).rejects.toMatchObject({ status: 400 });

		await expect(
			createPersonnelCounselingRecord(ctx, {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Renamed image',
				file: new File(['image'], 'renamed.pdf', { type: 'image/png' })
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects MIME-spoofed PDFs by checking file contents', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);

		await expect(
			createPersonnelCounselingRecord(ctx, {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Spoofed PDF',
				file: new File(['not a pdf'], 'spoofed.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 400 });

		expect(ctx.storagePort.files).toHaveLength(0);
	});

	it('rejects oversize PDF uploads before writing storage', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);
		const oversizeBytes = new Uint8Array(10 * 1024 * 1024 + 1);
		oversizeBytes.set([0x25, 0x50, 0x44, 0x46], 0);

		await expect(
			createPersonnelCounselingRecord(ctx, {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Oversize PDF',
				file: new File([oversizeBytes], 'oversize.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 400 });

		expect(ctx.storagePort.files).toHaveLength(0);
	});

	it('removes the uploaded counseling file if record creation fails', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);
		const insert = ctx.store.insert.bind(ctx.store);
		ctx.store.insert = async (table, orgId, data, select) => {
			if (table === 'counseling_records') throw new Error('insert failed');
			return insert(table, orgId, data, select);
		};

		await expect(
			createPersonnelCounselingRecord(ctx, {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Cleanup PDF',
				file: new File(VALID_PDF_BYTES, 'cleanup.pdf', { type: 'application/pdf' })
			})
		).rejects.toThrow('insert failed');

		expect(ctx.storagePort.files).toHaveLength(0);
	});

	it('requires Personnel operate capability and group scope', async () => {
		const viewOnly = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(viewOnly);
		await expect(listPersonnelCounselingRecords(viewOnly, 'person-1')).rejects.toMatchObject({ status: 403 });

		const outOfScope = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['other-group'] }
			}
		});
		seedPersonnel(outOfScope, 'group-1');
		await expect(listPersonnelCounselingRecords(outOfScope, 'person-1')).rejects.toMatchObject({ status: 403 });
	});
});
