import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { testPersonnelArtifactsContext } from './personnelArtifacts.testHelper';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	archivePersonnelCounselingRecord,
	createPersonnelCounselingDownloadUrl,
	createPersonnelCounselingRecord,
	deletePersonnelCounselingRecord,
	listPersonnelCounselingRecords,
	readPersonnelCounselings,
	restorePersonnelCounselingRecord
} from './personnelCounselingRecords.server';

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

function configureContext() {
	return createTestContext({
		auth: {
			capabilityMap: {
				calendar: 'view',
				personnel: 'configure',
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
	it('lets a Personnel operator upload counseling without gaining sensitive reads', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'operate',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);
		const created = await createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			dateConducted: '2026-09-26',
			title: 'Signed counseling',
			file: new File(VALID_PDF_BYTES, 'signed.pdf', { type: 'application/pdf' })
		});
		expect(created.title).toBe('Signed counseling');
		expect(ctx.storagePort.files).toHaveLength(1);
		await expect(listPersonnelCounselingRecords(testPersonnelArtifactsContext(ctx), 'person-1')).rejects.toMatchObject({
			status: 403
		});
	});

	it('uploads a signed counseling PDF and lists records newest first', async () => {
		const ctx = configureContext();
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

		const created = await createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			dateConducted: '2026-05-10',
			title: 'Monthly counseling',
			summary: 'Reviewed performance and board prep.',
			file
		});
		const records = await listPersonnelCounselingRecords(testPersonnelArtifactsContext(ctx), 'person-1');

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
		const ctx = configureContext();
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

		const archived = await archivePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			recordId: 'record-1'
		});
		expect(archived).toEqual({ id: 'record-1', archivedAt: expect.any(String) });
		await expect(
			archivePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				recordId: 'record-1'
			})
		).rejects.toMatchObject({ status: 409 });
		await expect(listPersonnelCounselingRecords(testPersonnelArtifactsContext(ctx), 'person-1')).resolves.toHaveLength(
			0
		);
		await expect(
			listPersonnelCounselingRecords(testPersonnelArtifactsContext(ctx), 'person-1', undefined, { archived: true })
		).resolves.toHaveLength(1);

		const restored = await restorePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			recordId: 'record-1'
		});
		expect(restored).toEqual({ id: 'record-1', archivedAt: null });
		await expect(
			deletePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				recordId: 'record-1'
			})
		).rejects.toMatchObject({
			status: 409
		});

		await archivePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			recordId: 'record-1'
		});
		await deletePersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			recordId: 'record-1'
		});
		await expect(
			listPersonnelCounselingRecords(testPersonnelArtifactsContext(ctx), 'person-1', undefined, { archived: true })
		).resolves.toHaveLength(0);
	});

	it('rejects non-PDF uploads', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);

		await expect(
			createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Image',
				file: new File(['image'], 'scan.png', { type: 'image/png' })
			})
		).rejects.toMatchObject({ status: 400 });

		await expect(
			createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Renamed image',
				file: new File(['image'], 'renamed.pdf', { type: 'image/png' })
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects MIME-spoofed PDFs by checking file contents', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);

		await expect(
			createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Spoofed PDF',
				file: new File(['not a pdf'], 'spoofed.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 400 });

		expect(ctx.storagePort.files).toHaveLength(0);
	});

	it('rejects oversize PDF uploads before writing storage', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const oversizeBytes = new Uint8Array(10 * 1024 * 1024 + 1);
		oversizeBytes.set([0x25, 0x50, 0x44, 0x46], 0);

		await expect(
			createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Oversize PDF',
				file: new File([oversizeBytes], 'oversize.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 400 });

		expect(ctx.storagePort.files).toHaveLength(0);
	});

	it('removes the uploaded counseling file if record creation fails', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const insert = ctx.store.insert.bind(ctx.store);
		ctx.store.insert = async (table, orgId, data, select) => {
			if (table === 'counseling_records') throw new Error('insert failed');
			return insert(table, orgId, data, select);
		};

		await expect(
			createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				dateConducted: '2026-05-10',
				title: 'Cleanup PDF',
				file: new File(VALID_PDF_BYTES, 'cleanup.pdf', { type: 'application/pdf' })
			})
		).rejects.toThrow('insert failed');

		expect(ctx.storagePort.files).toHaveLength(0);
	});

	it('requires Personnel configure capability for reads and group scope', async () => {
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
		await expect(
			listPersonnelCounselingRecords(testPersonnelArtifactsContext(viewOnly), 'person-1')
		).rejects.toMatchObject({ status: 403 });

		const outOfScope = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['other-group'] })
			}
		});
		seedPersonnel(outOfScope, 'group-1');
		await expect(
			listPersonnelCounselingRecords(testPersonnelArtifactsContext(outOfScope), 'person-1')
		).rejects.toMatchObject({ status: 403 });
	});

	it('retains metadata-only counseling fallbacks without exposing a storage path', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		ctx.store.seed('counseling_records', [
			{
				id: 'legacy',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				date_conducted: '2020-01-02',
				subject: 'Legacy subject',
				notes: 'Legacy notes',
				file_path: null,
				uploaded_by: null
			}
		]);
		await expect(listPersonnelCounselingRecords(testPersonnelArtifactsContext(ctx), 'person-1')).resolves.toEqual([
			{
				id: 'legacy',
				personnelId: 'person-1',
				dateConducted: '2020-01-02',
				title: 'Legacy subject',
				summary: 'Legacy notes',
				status: 'needs-title',
				conductedBy: null,
				uploadedBy: 'Leader upload',
				fileName: 'legacy.pdf',
				createdAt: '2020-01-02T00:00:00Z',
				archivedAt: null,
				archivedBy: null
			}
		]);
	});

	it('allows restoring an active counseling and still rejects repeated archive', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		const created = await createPersonnelCounselingRecord(context, {
			personnelId: 'person-1',
			dateConducted: '2026-10-01',
			title: 'Signed',
			file: new File(VALID_PDF_BYTES, 'signed.pdf', { type: 'application/pdf' })
		});
		await expect(
			restorePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: created.id })
		).resolves.toMatchObject({ id: created.id, archivedAt: null });
		expect(ctx.auditPort.events.at(-1)).toMatchObject({ action: 'personnel.counseling_record.restored' });
		await archivePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: created.id });
		await expect(
			archivePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: created.id })
		).rejects.toMatchObject({ status: 409 });
	});

	it('reports a committed deletion with pending file cleanup and completes it on retry', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		const created = await createPersonnelCounselingRecord(context, {
			personnelId: 'person-1',
			dateConducted: '2026-10-01',
			title: 'Signed',
			file: new File(VALID_PDF_BYTES, 'signed.pdf', { type: 'application/pdf' })
		});
		await archivePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: created.id });
		const remove = ctx.storagePort.remove;
		ctx.storagePort.remove = async () => {
			throw new Error('Storage unavailable');
		};
		await expect(
			deletePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: created.id })
		).resolves.toEqual({ fileCleanup: 'pending' });
		expect(await ctx.rawStore.findOne('counseling_records', ctx.auth.orgId, { id: created.id })).toBeNull();
		expect(ctx.storagePort.files).toHaveLength(1);

		ctx.storagePort.remove = remove;
		await expect(
			deletePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: created.id })
		).resolves.toEqual({ fileCleanup: 'complete' });
		expect(ctx.storagePort.files).toEqual([]);
		expect(ctx.auditPort.events.filter((event) => event.action === 'personnel.counseling_record.deleted')).toHaveLength(
			1
		);
	});

	it('does not mutate a counseling belonging to another Person in the same Organization', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		await ctx.store.insert('personnel', ctx.auth.orgId, { id: 'person-2', group_id: null });
		const context = testPersonnelArtifactsContext(ctx);
		const other = await createPersonnelCounselingRecord(context, {
			personnelId: 'person-2',
			dateConducted: '2026-10-01',
			title: 'Other Person',
			file: new File(VALID_PDF_BYTES, 'signed.pdf', { type: 'application/pdf' })
		});
		const priorEvents = [...ctx.auditPort.events];
		const prior = await ctx.rawStore.findOne('counseling_records', ctx.auth.orgId, { id: other.id });
		await expect(
			archivePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: other.id })
		).rejects.toMatchObject({ status: 404 });
		await expect(
			restorePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: other.id })
		).rejects.toMatchObject({ status: 404 });
		await expect(
			deletePersonnelCounselingRecord(context, { personnelId: 'person-1', recordId: other.id })
		).rejects.toMatchObject({ status: 404 });
		expect(await ctx.rawStore.findOne('counseling_records', ctx.auth.orgId, { id: other.id })).toEqual(prior);
		expect(ctx.storagePort.files).toHaveLength(1);
		expect(ctx.auditPort.events).toEqual(priorEvents);
	});
});

function counselingRow(ctx: ReturnType<typeof createTestContext>, id: string, dateConducted: string, extra = {}) {
	return {
		id,
		organization_id: ctx.auth.orgId,
		personnel_id: 'person-1',
		date_conducted: dateConducted,
		title: `Counseling ${id}`,
		uploaded_by: LEADER_USER_ID,
		file_path: `${ctx.auth.orgId}/counseling-records/person-1/${id}.pdf`,
		created_at: `${dateConducted}T10:00:00Z`,
		archived_at: null,
		...extra
	};
}

describe('counseling conducted by', () => {
	const upload = (conductedBy: string | undefined) => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		return createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			dateConducted: '2026-10-02',
			title: 'Monthly counseling',
			conductedBy,
			file: new File(VALID_PDF_BYTES, 'monthly.pdf', { type: 'application/pdf' })
		});
	};

	it('keeps the trimmed name the uploader gave', async () => {
		expect((await upload('  SSG Alvarez  ')).conductedBy).toBe('SSG Alvarez');
	});

	it('records no conductor when the field is blank or absent', async () => {
		expect((await upload('   ')).conductedBy).toBeNull();
		expect((await upload(undefined)).conductedBy).toBeNull();
	});

	it('rejects a name longer than the stored limit before uploading anything', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		await expect(
			createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				dateConducted: '2026-10-02',
				title: 'Monthly counseling',
				conductedBy: 'x'.repeat(121),
				file: new File(VALID_PDF_BYTES, 'monthly.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 400 });
		expect(ctx.storagePort.files).toEqual([]);
	});
});

describe('Files tab counseling read', () => {
	function seededContext() {
		const ctx = configureContext();
		seedPersonnel(ctx);
		ctx.store.seed('organization_memberships', [
			{ id: 'membership-1', organization_id: ctx.auth.orgId, user_id: LEADER_USER_ID, email: 'leader@example.com' }
		]);
		ctx.store.seed('counseling_records', [
			counselingRow(ctx, 'newest', '2026-10-02', { conducted_by: 'SSG Alvarez' }),
			counselingRow(ctx, 'same-month', '2026-10-01'),
			counselingRow(ctx, 'august', '2026-08-15'),
			counselingRow(ctx, 'archived-june', '2026-06-10', { archived_at: '2026-06-11T00:00:00Z' }),
			counselingRow(ctx, 'too-old', '2025-09-30')
		]);
		return ctx;
	}

	it('reads the newest page with the active total, covered months and the viewer label', async () => {
		const ctx = seededContext();

		const read = await readPersonnelCounselings(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			asOf: '2026-10-19',
			limit: 2
		});

		expect(read.records.map((record) => [record.id, record.conductedBy])).toEqual([
			['newest', 'SSG Alvarez'],
			['same-month', null]
		]);
		expect(read.total).toBe(4);
		expect(read.coveredMonths.sort()).toEqual(['2026-08', '2026-10']);
		expect(read.lastConductedOn).toBe('2026-10-02');
		expect(read.uploaderLabel).toBe('leader@example.com');
	});

	it('names the latest counseling held even when later-dated records fill the first page', async () => {
		const ctx = seededContext();
		ctx.store.seed('counseling_records', [
			counselingRow(ctx, 'later-1', '2026-10-21'),
			counselingRow(ctx, 'later-2', '2026-10-22'),
			counselingRow(ctx, 'later-3', '2026-11-03'),
			counselingRow(ctx, 'archived-later', '2026-10-20', { archived_at: '2026-10-01T00:00:00Z' })
		]);

		const read = await readPersonnelCounselings(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			asOf: '2026-10-19',
			limit: 3
		});

		expect(read.records.map((record) => record.id)).toEqual(['later-3', 'later-2', 'later-1']);
		expect(read.lastConductedOn).toBe('2026-10-02');
		expect(read.coveredMonths.sort()).toEqual(['2026-08', '2026-10']);
	});

	it('counts a counseling held on the viewer day as the last one', async () => {
		const ctx = seededContext();

		const read = await readPersonnelCounselings(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			asOf: '2026-10-02',
			limit: 2
		});

		expect(read.lastConductedOn).toBe('2026-10-02');
	});

	it('names a last counseling that is older than the coverage window', async () => {
		const ctx = seededContext();

		const read = await readPersonnelCounselings(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			asOf: '2027-10-19',
			limit: 2
		});

		expect(read.lastConductedOn).toBe('2026-10-02');
		expect(read.coveredMonths).toEqual([]);
	});

	it('names no last counseling before the first one was held', async () => {
		const ctx = seededContext();

		const read = await readPersonnelCounselings(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			asOf: '2025-06-01',
			limit: 2
		});

		expect(read.lastConductedOn).toBeNull();
	});

	it('offers no conductor when the member has no name or email on file', async () => {
		const ctx = seededContext();
		ctx.store.seed('organization_memberships', [
			{ id: 'membership-2', organization_id: ctx.auth.orgId, user_id: ctx.auth.userId }
		]);

		const read = await readPersonnelCounselings(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			asOf: '2026-10-19',
			limit: 2
		});

		expect(read.uploaderLabel).toBeNull();
	});

	it('lists older records from an offset without repeating the first page', async () => {
		const ctx = seededContext();

		const older = await listPersonnelCounselingRecords(testPersonnelArtifactsContext(ctx), 'person-1', 2, {
			offset: 2
		});

		expect(older.map((record) => record.id)).toEqual(['august', 'too-old']);
	});

	it('refuses a reader without sensitive record access', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'operate',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);

		await expect(
			readPersonnelCounselings(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				asOf: '2026-10-19',
				limit: 2
			})
		).rejects.toMatchObject({ status: 403 });
	});
});

describe('counseling download', () => {
	it('signs a short-lived URL for the counseling bucket', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const created = await createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			dateConducted: '2026-10-02',
			title: 'Monthly counseling',
			file: new File(VALID_PDF_BYTES, 'monthly.pdf', { type: 'application/pdf' })
		});

		const result = await createPersonnelCounselingDownloadUrl(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			recordId: created.id
		});

		expect(result.url).toContain('/counseling-files/');
		expect(result.url).toContain('expires=300');
	});

	it('answers a record of another Person like a missing one', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		await ctx.store.insert('personnel', ctx.auth.orgId, { id: 'person-2', group_id: null });
		const other = await createPersonnelCounselingRecord(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-2',
			dateConducted: '2026-10-02',
			title: 'Other Person',
			file: new File(VALID_PDF_BYTES, 'signed.pdf', { type: 'application/pdf' })
		});

		await expect(
			createPersonnelCounselingDownloadUrl(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				recordId: other.id
			})
		).rejects.toMatchObject({ status: 404 });
	});
});
