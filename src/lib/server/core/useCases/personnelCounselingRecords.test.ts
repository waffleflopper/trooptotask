import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createPersonnelCounselingRecord, listPersonnelCounselingRecords } from './personnelCounselingRecords';

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
		const file = new File(['pdf-bytes'], 'monthly-counseling.pdf', { type: 'application/pdf' });

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
			uploadedBy: 'test-user',
			status: 'uploaded'
		});
		expect(created.filePath).toMatch(/person-1\/counseling-records\/.+monthly-counseling\.pdf$/);
		expect((ctx.storage as typeof ctx.storage & { files: unknown[] }).files).toHaveLength(1);
		expect(records.map((record) => record.id)).toEqual([created.id, 'old-record']);
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
