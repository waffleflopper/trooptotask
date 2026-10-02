import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { testPersonnelArtifactsContext } from './personnelArtifacts.testHelper';
import { createPersonnelDocument } from './personnelDocuments.server';
import { createPersonnelCounselingRecord } from './personnelCounselingRecords.server';
import type { PersonnelArtifactWriter } from './contracts';

const cases = [
	{ family: 'document', table: 'personnel_documents', create: createPersonnelDocument },
	{ family: 'counseling', table: 'counseling_records', create: createPersonnelCounselingRecord }
] as const;

// A finite registration and actual in-memory bytes exercise the real operations.
// SQL locking and Storage serialization are verified at their separate boundaries.
function fixture(fault: 'none' | 'attachment' | 'attachment-ack' | 'compensation' | 'upload' | 'settlement') {
	const ctx = createTestContext();
	const storage = ctx.storagePort;
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
	const context = testPersonnelArtifactsContext(ctx);
	let active = false;
	const admitted = context.writerFor.bind(context);
	context.writerFor = async (id) => {
		const writer = await admitted(id);
		return {
			...writer,
			async uploadFile(kind, path, file) {
				active = true;
				await writer.uploadFile(kind, path, file);
				if (fault === 'upload') throw new Error('Upload response lost');
				return {
					async complete() {
						if (fault === 'settlement') throw new Error('Settlement unconfirmed');
						active = false;
					}
				};
			},
			async insert(table, data) {
				expect(active).toBe(true);
				if (fault === 'attachment' || fault === 'compensation') throw new Error('Attachment rejected');
				const row = await writer.insert(table, data);
				return fault === 'attachment-ack' ? null : row;
			},
			async removeFile(kind, path) {
				expect(active).toBe(true);
				if (fault === 'compensation') throw new Error('Removal unconfirmed');
				await writer.removeFile(kind, path);
			}
		} as PersonnelArtifactWriter;
	};
	return { ctx, context, storage, active: () => active };
}

describe.each(cases)('$family upload registration lifetime', ({ create, table }) => {
	it('settles only after a matching persisted attachment, leaving its bytes available', async () => {
		const run = fixture('none');
		const row = await create(run.context, {
			personnelId: 'person-1',
			title: 'Known artifact',
			dateConducted: '2026-10-02',
			file: new File(['%PDF-1.7'], 'known.pdf', { type: 'application/pdf' })
		});
		expect(run.active()).toBe(false);
		expect(await run.ctx.rawStore.findOne(table, run.ctx.auth.orgId, { id: row.id })).toMatchObject({
			personnel_id: 'person-1',
			file_path: run.storage.files[0].path
		});
		expect(run.storage.files).toHaveLength(1);
	});
	it.each(['attachment', 'attachment-ack'] as const)(
		'settles after acknowledged file compensation for %s failure',
		async (fault) => {
			const run = fixture(fault);
			await expect(
				create(run.context, {
					personnelId: 'person-1',
					title: 'Known artifact',
					dateConducted: '2026-10-02',
					file: new File(['%PDF-1.7'], 'known.pdf', { type: 'application/pdf' })
				})
			).rejects.toThrow();
			expect(run.active()).toBe(false);
			expect(run.storage.files).toEqual([]);
		}
	);
	it.each(['upload', 'compensation', 'settlement'] as const)(
		'retains the registration when %s outcome is unconfirmed',
		async (fault) => {
			const run = fixture(fault);
			await expect(
				create(run.context, {
					personnelId: 'person-1',
					title: 'Known artifact',
					dateConducted: '2026-10-02',
					file: new File(['%PDF-1.7'], 'known.pdf', { type: 'application/pdf' })
				})
			).rejects.toThrow();
			expect(run.active()).toBe(true);
			expect(run.storage.files).toHaveLength(1);
		}
	);
});
