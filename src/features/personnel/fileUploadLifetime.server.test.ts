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

type Fault = 'none' | 'attachment' | 'attachment-ack' | 'compensation' | 'reconciliation' | 'upload' | 'settlement';

// A finite registration and actual in-memory bytes exercise the real operations.
// SQL locking and Storage serialization are verified at their separate boundaries.
function fixture(fault: Fault) {
	const ctx = createTestContext();
	const storage = ctx.storagePort;
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
	const context = testPersonnelArtifactsContext(ctx);
	let active = false;
	const admitted = context.writerFor.bind(context);
	if (fault === 'compensation')
		storage.remove = async () => {
			throw new Error('Removal unconfirmed');
		};
	context.writerFor = async (id) => {
		const writer = await admitted(id);
		const attach = async <T>(create: () => Promise<T>) => {
			expect(active).toBe(true);
			if (fault === 'attachment' || fault === 'compensation' || fault === 'reconciliation')
				throw new Error('Attachment rejected');
			const row = await create();
			if (fault === 'attachment-ack') throw new Error('Attachment response lost');
			return row;
		};
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
			createDocument: (data) => attach(() => writer.createDocument(data)),
			createCounseling: (data) => attach(() => writer.createCounseling(data)),
			async reconcileFileAttachment(kind, path) {
				expect(active).toBe(true);
				if (fault === 'reconciliation') throw new Error('Reconciliation unconfirmed');
				return writer.reconcileFileAttachment(kind, path);
			}
		} as PersonnelArtifactWriter;
	};
	return { ctx, context, storage, admitted, active: () => active };
}

const input = {
	personnelId: 'person-1',
	title: 'Known artifact',
	dateConducted: '2026-10-02',
	file: () => new File(['%PDF-1.7'], 'known.pdf', { type: 'application/pdf' })
};

describe.each(cases)('$family upload registration lifetime', ({ family, create, table }) => {
	it('settles only after a matching persisted attachment, leaving its bytes available', async () => {
		const run = fixture('none');
		const row = await create(run.context, { ...input, file: input.file() });
		expect(run.active()).toBe(false);
		expect(await run.ctx.rawStore.findOne(table, run.ctx.auth.orgId, { id: row.id })).toMatchObject({
			personnel_id: 'person-1',
			file_path: run.storage.files[0].path
		});
		expect(run.storage.files).toHaveLength(1);
	});

	it('returns the committed record and keeps its bytes when the attachment response is lost', async () => {
		const run = fixture('attachment-ack');
		const row = await create(run.context, { ...input, file: input.file() });
		expect(run.active()).toBe(false);
		expect(await run.ctx.rawStore.findOne(table, run.ctx.auth.orgId, { id: row.id })).toMatchObject({
			file_path: run.storage.files[0].path
		});
		expect(run.storage.files).toHaveLength(1);
	});

	it('removes bytes of a definitively unattached upload and settles its registration', async () => {
		const run = fixture('attachment');
		await expect(create(run.context, { ...input, file: input.file() })).rejects.toThrow('Attachment rejected');
		expect(run.active()).toBe(false);
		expect(run.storage.files).toEqual([]);
		expect(await run.ctx.rawStore.findMany(table, run.ctx.auth.orgId)).toEqual([]);
	});

	it('settles once an unattached key is durably retired even if its removal fails, and refuses a late attachment', async () => {
		const run = fixture('compensation');
		await expect(create(run.context, { ...input, file: input.file() })).rejects.toThrow('Attachment rejected');
		expect(run.active()).toBe(false);
		const [file] = run.storage.files;
		expect(file).toBeDefined();
		const writer = await run.admitted('person-1');
		const late = {
			title: 'Late',
			summary: null,
			dateConducted: '2026-10-02',
			filePath: file.path,
			fileSizeBytes: 8,
			contentType: 'application/pdf',
			uploadedBy: 'test-user',
			createdAt: '2026-10-02T00:00:00.000Z'
		};
		await expect(family === 'document' ? writer.createDocument(late) : writer.createCounseling(late)).rejects.toThrow();
		expect(await run.ctx.rawStore.findMany(table, run.ctx.auth.orgId)).toEqual([]);
	});

	it.each(['upload', 'reconciliation', 'settlement'] as const)(
		'retains the registration when %s outcome is unconfirmed',
		async (fault) => {
			const run = fixture(fault);
			await expect(create(run.context, { ...input, file: input.file() })).rejects.toThrow();
			expect(run.active()).toBe(true);
			expect(run.storage.files).toHaveLength(1);
		}
	);
});
