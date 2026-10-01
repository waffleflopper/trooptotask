import { createLeaderNoteDataSource } from '$features/personnel/index.server';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryDataStore, createTestStoragePort } from '$lib/server/adapters/inMemory';
import { cleanupArchivedRecords, DEFAULT_ARCHIVE_RETENTION_MONTHS } from './archiveRetention';
import { COUNSELING_RECORDS_BUCKET } from './personnelCounselingRecords';
import { PERSONNEL_DOCUMENTS_BUCKET } from './personnelDocuments';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';

const NOW = new Date('2026-05-30T12:00:00.000Z');

function buildPorts() {
	const store = createInMemoryDataStore();
	const storage = createTestStoragePort();
	const assignmentTypes = {
		async deleteExpiredUnreferenced(orgId: string, ids: string[], cutoff: string): Promise<number> {
			const candidates = await store.findMany<{ id: string }>('assignment_types', orgId, undefined, {
				inFilters: { id: ids },
				rangeFilters: [{ column: 'archived_at', op: 'lt', value: cutoff }],
				isNull: { archived_at: false }
			});
			const references = await store.findMany<{ assignment_type_id: string }>('daily_assignments', orgId, undefined, {
				inFilters: { assignment_type_id: candidates.map((row) => row.id) }
			});
			const referencedIds = new Set(references.map((row) => row.assignment_type_id));
			return store.deleteManyByIds(
				'assignment_types',
				orgId,
				candidates.map((row) => row.id).filter((id) => !referencedIds.has(id))
			);
		}
	};

	return {
		store,
		storage,
		assignmentTypes,
		notifications: { notifyAdmins: vi.fn<NotificationDeliveryPort['notifyAdmins']>().mockResolvedValue(undefined) },
		leaderNotes: createLeaderNoteDataSource({
			findArchivedBefore: async (orgId, cutoff) => {
				const notes = await store.findMany<{ id: string; archived_at: string | null }>('leader_notes', orgId);
				return notes.filter((note) => note.archived_at !== null && Date.parse(note.archived_at) < Date.parse(cutoff));
			},
			deleteByIds: (orgId, ids) => store.deleteManyByIds('leader_notes', orgId, ids)
		})
	};
}

function isoMonthsAgo(months: number): string {
	const date = new Date(NOW);
	date.setMonth(date.getMonth() - months);
	return date.toISOString();
}

function seedRetentionRows(ports: ReturnType<typeof buildPorts>) {
	const expired = isoMonthsAgo(13);
	const recent = isoMonthsAgo(3);

	ports.store.seed('personnel', [
		{
			id: 'person-expired',
			organization_id: 'org-1',
			first_name: 'Synthetic',
			last_name: 'Smith',
			archived_at: expired
		},
		{ id: 'person-recent', organization_id: 'org-1', archived_at: recent },
		{ id: 'person-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.store.seed('personnel_follow_ups', [
		{ id: 'follow-up-expired', organization_id: 'org-1', status: 'archived', archived_at: expired },
		{ id: 'follow-up-recent', organization_id: 'org-1', status: 'archived', archived_at: recent },
		{ id: 'follow-up-active', organization_id: 'org-1', status: 'open', archived_at: null }
	]);
	ports.store.seed('counseling_records', [
		{
			id: 'counseling-expired',
			organization_id: 'org-1',
			file_path: 'org-1/counseling-records/person-1/expired.pdf',
			archived_at: expired
		},
		{
			id: 'counseling-recent',
			organization_id: 'org-1',
			file_path: 'org-1/counseling-records/person-1/recent.pdf',
			archived_at: recent
		},
		{ id: 'counseling-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.store.seed('personnel_documents', [
		{
			id: 'document-expired',
			organization_id: 'org-1',
			file_path: 'org-1/personnel/person-1/documents/expired.pdf',
			archived_at: expired
		},
		{
			id: 'document-recent',
			organization_id: 'org-1',
			file_path: 'org-1/personnel/person-1/documents/recent.pdf',
			archived_at: recent
		},
		{
			id: 'document-active',
			organization_id: 'org-1',
			file_path: 'org-1/personnel/person-1/documents/active.pdf',
			archived_at: null
		}
	]);
	ports.store.seed('leader_notes', [
		{ id: 'note-expired', organization_id: 'org-1', archived_at: expired },
		{ id: 'note-recent', organization_id: 'org-1', archived_at: recent },
		{ id: 'note-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.store.seed('ict_tasks', [
		{ id: 'ict-expired', organization_id: 'org-1', archived_at: expired },
		{ id: 'ict-recent', organization_id: 'org-1', archived_at: recent },
		{ id: 'ict-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.store.seed('assignment_types', [
		{ id: 'assignment-expired', organization_id: 'org-1', archived_at: expired },
		{ id: 'assignment-recent', organization_id: 'org-1', archived_at: recent },
		{ id: 'assignment-active', organization_id: 'org-1', archived_at: null }
	]);
	ports.storage.files.push(
		{
			bucket: PERSONNEL_DOCUMENTS_BUCKET,
			path: 'org-1/personnel/person-1/documents/expired.pdf',
			data: new ArrayBuffer(1)
		},
		{
			bucket: PERSONNEL_DOCUMENTS_BUCKET,
			path: 'org-1/personnel/person-1/documents/recent.pdf',
			data: new ArrayBuffer(1)
		},
		{
			bucket: COUNSELING_RECORDS_BUCKET,
			path: 'org-1/counseling-records/person-1/expired.pdf',
			data: new ArrayBuffer(1)
		},
		{
			bucket: COUNSELING_RECORDS_BUCKET,
			path: 'org-1/counseling-records/person-1/recent.pdf',
			data: new ArrayBuffer(1)
		}
	);
}

async function idsFor(ports: ReturnType<typeof buildPorts>, table: string): Promise<string[]> {
	const rows = await ports.store.findMany<{ id: string }>(table, 'org-1');
	return rows.map((row) => row.id).sort();
}

function buildParentRetentionPorts(survivingPersonnelIds: string[] = []) {
	const ports = buildPorts();
	ports.store.seed('personnel', [
		{ id: 'person-expired', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00.000Z' },
		{ id: 'person-survivor', organization_id: 'org-1', archived_at: '2025-02-01T00:00:00.000Z' },
		{ id: 'person-foreign', organization_id: 'org-2', archived_at: '2025-01-01T00:00:00.000Z' }
	]);
	for (const [table, bucket] of [
		['personnel_documents', PERSONNEL_DOCUMENTS_BUCKET],
		['counseling_records', COUNSELING_RECORDS_BUCKET]
	]) {
		const rows = [
			{ id: `${table}-active`, personnel_id: 'person-expired', organization_id: 'org-1', archived_at: null },
			{
				id: `${table}-recent`,
				personnel_id: 'person-expired',
				organization_id: 'org-1',
				archived_at: '2026-04-01T00:00:00.000Z'
			},
			{
				id: `${table}-survivor`,
				personnel_id: 'person-survivor',
				organization_id: 'org-1',
				archived_at: null
			},
			{
				id: `${table}-foreign`,
				personnel_id: 'person-foreign',
				organization_id: 'org-2',
				archived_at: null
			}
		].map((row) => ({ ...row, file_path: `${row.organization_id}/${row.id}.pdf` }));
		ports.store.seed(table, rows);
		ports.storage.files.push(...rows.map((row) => ({ bucket, path: row.file_path, data: new ArrayBuffer(1) })), {
			bucket,
			path: 'org-1/unrelated.pdf',
			data: new ArrayBuffer(1)
		});
	}

	// Model the parent-delete port losing child metadata before it returns. This
	// proves orchestration with fake ports, not PostgreSQL cascades or real Storage.
	const deleteMany = ports.store.deleteManyByIds.bind(ports.store);
	vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation(async (table, orgId, ids) => {
		if (table !== 'personnel') return deleteMany(table, orgId, ids);
		const removedIds = ids.filter((id) => !survivingPersonnelIds.includes(id));
		const deleted = await deleteMany(table, orgId, removedIds);
		for (const childTable of ['personnel_documents', 'counseling_records', 'leader_notes']) {
			const children = await ports.store.findMany<{ id: string }>(childTable, orgId, undefined, {
				inFilters: { personnel_id: removedIds }
			});
			await deleteMany(
				childTable,
				orgId,
				children.map((row) => row.id)
			);
		}
		return deleted;
	});
	return ports;
}

function storedFileKeys(ports: ReturnType<typeof buildPorts>): string[] {
	return ports.storage.files.map((file) => `${file.bucket}:${file.path}`).sort();
}

async function parentRetentionState(ports: ReturnType<typeof buildPorts>) {
	const rows = await Promise.all(
		['personnel', 'personnel_documents', 'counseling_records', 'leader_notes'].flatMap((table) =>
			['org-1', 'org-2'].map((orgId) => ports.store.findMany(table, orgId))
		)
	);
	return structuredClone({ rows, files: ports.storage.files });
}

const RETAINED_PARENT_FILES = [
	`${COUNSELING_RECORDS_BUCKET}:org-1/unrelated.pdf`,
	`${COUNSELING_RECORDS_BUCKET}:org-2/counseling_records-foreign.pdf`,
	`${PERSONNEL_DOCUMENTS_BUCKET}:org-1/unrelated.pdf`,
	`${PERSONNEL_DOCUMENTS_BUCKET}:org-2/personnel_documents-foreign.pdf`
].sort();

describe('Personnel parent retention', () => {
	it('deletes only this Organization’s archived Personnel strictly before the cutoff', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{ id: 'expired', organization_id: 'org-1', archived_at: '2025-05-30T11:59:59.999Z' },
			{ id: 'at-cutoff', organization_id: 'org-1', archived_at: '2025-05-30T12:00:00.000Z' },
			{ id: 'after-cutoff', organization_id: 'org-1', archived_at: '2025-05-30T12:00:00.001Z' },
			{ id: 'active', organization_id: 'org-1', archived_at: null },
			{ id: 'foreign', organization_id: 'org-2', archived_at: '2025-01-01T00:00:00.000Z' }
		]);
		const foreignBefore = structuredClone(await ports.store.findMany('personnel', 'org-2'));

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(1);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['active', 'after-cutoff', 'at-cutoff']);
		await expect(ports.store.findMany('personnel', 'org-2')).resolves.toEqual(foreignBefore);
	});

	it('captures active and recently archived files before child metadata disappears, counting only parents', async () => {
		const ports = buildParentRetentionPorts();

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(2);
		expect(result.families).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'personnel', deletedCount: 2 })])
		);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual([]);
		await expect(idsFor(ports, 'personnel_documents')).resolves.toEqual([]);
		await expect(idsFor(ports, 'counseling_records')).resolves.toEqual([]);
		expect(storedFileKeys(ports)).toEqual(RETAINED_PARENT_FILES);
		await expect(ports.store.findMany('personnel', 'org-2')).resolves.toEqual([
			{ id: 'person-foreign', organization_id: 'org-2', archived_at: '2025-01-01T00:00:00.000Z' }
		]);
	});

	it('removes only confirmed deleted parents’ files when another candidate survives', async () => {
		const ports = buildParentRetentionPorts(['person-survivor']);
		const survivorDocuments = structuredClone(
			await ports.store.findMany('personnel_documents', 'org-1', { personnel_id: 'person-survivor' })
		);
		const survivorCounselings = structuredClone(
			await ports.store.findMany('counseling_records', 'org-1', { personnel_id: 'person-survivor' })
		);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(1);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['person-survivor']);
		await expect(ports.store.findMany('personnel_documents', 'org-1')).resolves.toEqual(survivorDocuments);
		await expect(ports.store.findMany('counseling_records', 'org-1')).resolves.toEqual(survivorCounselings);
		expect(storedFileKeys(ports)).toEqual(
			[
				...RETAINED_PARENT_FILES,
				`${COUNSELING_RECORDS_BUCKET}:org-1/counseling_records-survivor.pdf`,
				`${PERSONNEL_DOCUMENTS_BUCKET}:org-1/personnel_documents-survivor.pdf`
			].sort()
		);
	});

	it('preserves all parent, artifact and file state when no candidate is deleted', async () => {
		const ports = buildParentRetentionPorts(['person-expired', 'person-survivor']);
		const before = await parentRetentionState(ports);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(0);
		expect(result.orgsAffected).toBe(0);
		expect(await parentRetentionState(ports)).toEqual(before);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it.each(['personnel_documents', 'counseling_records'])(
		'keeps parents and files when the %s manifest cannot be read',
		async (failedTable) => {
			const ports = buildParentRetentionPorts();
			const before = await parentRetentionState(ports);
			const findMany = ports.store.findMany.bind(ports.store);
			vi.spyOn(ports.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
				if (table === failedTable && options?.inFilters?.personnel_id)
					throw new Error('parent file manifest unavailable');
				return findMany(table, orgId, filters, options);
			});

			await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
				'parent file manifest unavailable'
			);

			expect(await parentRetentionState(ports)).toEqual(before);
			expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
		}
	);

	it('preserves all parent, artifact and file state when parent deletion fails', async () => {
		const ports = buildParentRetentionPorts();
		const before = await parentRetentionState(ports);
		const deleteMany = ports.store.deleteManyByIds.bind(ports.store);
		vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation((table, orgId, ids) => {
			if (table === 'personnel') throw new Error('parent deletion unavailable');
			return deleteMany(table, orgId, ids);
		});

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'parent deletion unavailable'
		);

		expect(await parentRetentionState(ports)).toEqual(before);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('retains every file and rejects success when durable parent deletion cannot be confirmed', async () => {
		const ports = buildParentRetentionPorts();
		const filesBefore = structuredClone(ports.storage.files);
		const findMany = ports.store.findMany.bind(ports.store);
		vi.spyOn(ports.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table === 'personnel' && options?.inFilters?.id) throw new Error('parent confirmation unavailable');
			return findMany(table, orgId, filters, options);
		});

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'parent confirmation unavailable'
		);

		await expect(idsFor(ports, 'personnel')).resolves.toEqual([]);
		await expect(idsFor(ports, 'personnel_documents')).resolves.toEqual([]);
		await expect(idsFor(ports, 'counseling_records')).resolves.toEqual([]);
		expect(ports.storage.files).toEqual(filesBefore);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('exposes Storage failure after durable cascade without rolling back parents or reporting success', async () => {
		const ports = buildParentRetentionPorts();
		const remove = ports.storage.remove.bind(ports.storage);
		vi.spyOn(ports.storage, 'remove').mockImplementation(async (bucket, paths) => {
			if (bucket === PERSONNEL_DOCUMENTS_BUCKET) throw new Error('document Storage unavailable');
			return remove(bucket, paths);
		});

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'document Storage unavailable'
		);

		await expect(idsFor(ports, 'personnel')).resolves.toEqual([]);
		await expect(idsFor(ports, 'personnel_documents')).resolves.toEqual([]);
		await expect(idsFor(ports, 'counseling_records')).resolves.toEqual([]);
		expect(storedFileKeys(ports)).toEqual(
			[
				...RETAINED_PARENT_FILES,
				`${PERSONNEL_DOCUMENTS_BUCKET}:org-1/personnel_documents-active.pdf`,
				`${PERSONNEL_DOCUMENTS_BUCKET}:org-1/personnel_documents-recent.pdf`,
				`${PERSONNEL_DOCUMENTS_BUCKET}:org-1/personnel_documents-survivor.pdf`
			].sort()
		);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('counts expired leader notes before their parent cascade and does not count recent cascaded notes', async () => {
		const ports = buildParentRetentionPorts();
		ports.store.seed('leader_notes', [
			{
				id: 'expired-note',
				organization_id: 'org-1',
				personnel_id: 'person-expired',
				archived_at: '2025-01-01T00:00:00.000Z'
			},
			{
				id: 'recent-note',
				organization_id: 'org-1',
				personnel_id: 'person-expired',
				archived_at: '2026-04-01T00:00:00.000Z'
			},
			{
				id: 'foreign-note',
				organization_id: 'org-2',
				personnel_id: 'person-foreign',
				archived_at: '2025-01-01T00:00:00.000Z'
			}
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(3);
		expect(result.families).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'leader-notes', deletedCount: 1 }),
				expect.objectContaining({ key: 'personnel', deletedCount: 2 })
			])
		);
		await expect(idsFor(ports, 'leader_notes')).resolves.toEqual([]);
		await expect(ports.store.findMany('leader_notes', 'org-2')).resolves.toEqual([
			{
				id: 'foreign-note',
				organization_id: 'org-2',
				personnel_id: 'person-foreign',
				archived_at: '2025-01-01T00:00:00.000Z'
			}
		]);
	});
});

describe('cleanupArchivedRecords', () => {
	it('deletes expired archived rows and retains recent or active rows for every archive family', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(7);
		expect(result.orgsAffected).toBe(1);
		expect(result.families).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'personnel', deletedCount: 1 }),
				expect.objectContaining({ key: 'personnel-follow-ups', deletedCount: 1 }),
				expect.objectContaining({ key: 'counseling-records', deletedCount: 1 }),
				expect.objectContaining({ key: 'personnel-documents', deletedCount: 1 }),
				expect.objectContaining({ key: 'leader-notes', deletedCount: 1 }),
				expect.objectContaining({ key: 'critical-tasks', deletedCount: 1 }),
				expect.objectContaining({ key: 'assignment-types', deletedCount: 1 })
			])
		);

		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['person-active', 'person-recent']);
		await expect(idsFor(ports, 'personnel_follow_ups')).resolves.toEqual(['follow-up-active', 'follow-up-recent']);
		await expect(idsFor(ports, 'counseling_records')).resolves.toEqual(['counseling-active', 'counseling-recent']);
		await expect(idsFor(ports, 'personnel_documents')).resolves.toEqual(['document-active', 'document-recent']);
		await expect(idsFor(ports, 'leader_notes')).resolves.toEqual(['note-active', 'note-recent']);
		await expect(idsFor(ports, 'ict_tasks')).resolves.toEqual(['ict-active', 'ict-recent']);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['assignment-active', 'assignment-recent']);
	});

	it('stops before deleting Personnel or reporting success when note deletion fails', async () => {
		const ports = buildPorts();
		ports.store.seed('leader_notes', [{ id: 'note', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00Z' }]);
		ports.store.seed('personnel', [{ id: 'person', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00Z' }]);
		const deleteMany = ports.store.deleteManyByIds.bind(ports.store);
		vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation((table, orgId, ids) => {
			if (table === 'leader_notes') throw new Error('Note deletion unavailable');
			return deleteMany(table, orgId, ids);
		});
		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'Note deletion unavailable'
		);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['person']);
		await expect(idsFor(ports, 'leader_notes')).resolves.toEqual(['note']);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('removes expired personnel document storage files before deleting document rows', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(ports.storage.files).toEqual([
			expect.objectContaining({
				bucket: PERSONNEL_DOCUMENTS_BUCKET,
				path: 'org-1/personnel/person-1/documents/recent.pdf'
			}),
			expect.objectContaining({
				bucket: COUNSELING_RECORDS_BUCKET,
				path: 'org-1/counseling-records/person-1/recent.pdf'
			})
		]);
	});

	it('keeps storage files when database deletion fails', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);
		const deleteManyByIds = ports.store.deleteManyByIds.bind(ports.store);
		vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation(async (table, orgId, ids) => {
			if (table === 'personnel_documents') {
				throw new Error('database delete failed');
			}
			return deleteManyByIds(table, orgId, ids);
		});

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'database delete failed'
		);

		expect(ports.storage.files).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					bucket: PERSONNEL_DOCUMENTS_BUCKET,
					path: 'org-1/personnel/person-1/documents/expired.pdf'
				})
			])
		);
	});

	it('removes storage files for personnel-owned documents that would be deleted by personnel cascades', async () => {
		const ports = buildPorts();
		const expired = isoMonthsAgo(13);
		const recent = isoMonthsAgo(3);
		ports.store.seed('personnel', [{ id: 'person-expired', organization_id: 'org-1', archived_at: expired }]);
		ports.store.seed('personnel_documents', [
			{
				id: 'document-recent',
				organization_id: 'org-1',
				personnel_id: 'person-expired',
				file_path: 'org-1/personnel/person-expired/documents/recent.pdf',
				archived_at: recent
			}
		]);
		ports.store.seed('counseling_records', [
			{
				id: 'counseling-recent',
				organization_id: 'org-1',
				personnel_id: 'person-expired',
				file_path: 'org-1/counseling-records/person-expired/recent.pdf',
				archived_at: recent
			}
		]);
		ports.storage.files.push(
			{
				bucket: PERSONNEL_DOCUMENTS_BUCKET,
				path: 'org-1/personnel/person-expired/documents/recent.pdf',
				data: new ArrayBuffer(1)
			},
			{
				bucket: COUNSELING_RECORDS_BUCKET,
				path: 'org-1/counseling-records/person-expired/recent.pdf',
				data: new ArrayBuffer(1)
			}
		);

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(ports.storage.files).toEqual([]);
	});

	it('retains expired assignment types used by saved Calendar assignments without Duty storage', async () => {
		const ports = buildPorts();
		const expired = isoMonthsAgo(13);
		ports.store.seed('assignment_types', [
			{ id: 'person-type', organization_id: 'org-1', archived_at: expired },
			{ id: 'group-type', organization_id: 'org-1', archived_at: expired },
			{ id: 'unused-type', organization_id: 'org-1', archived_at: expired },
			{ id: 'foreign-type', organization_id: 'org-2', archived_at: expired }
		]);
		ports.store.seed('daily_assignments', [
			{
				id: 'saved-person-assignment',
				organization_id: 'org-1',
				assignment_type_id: 'person-type',
				date: '2025-01-02',
				assignee_id: 'person-1'
			},
			{
				id: 'saved-group-assignment',
				organization_id: 'org-1',
				assignment_type_id: 'group-type',
				date: '2025-01-03',
				assignee_id: 'group-1'
			}
		]);
		const findMany = ports.store.findMany.bind(ports.store);
		vi.spyOn(ports.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table.startsWith('duty_')) throw new Error('Duty storage is unavailable');
			return findMany(table, orgId, filters, options);
		});
		const deleteManyByIds = ports.store.deleteManyByIds.bind(ports.store);
		vi.spyOn(ports.store, 'deleteManyByIds').mockImplementation((table, orgId, ids) => {
			if (table.startsWith('duty_')) throw new Error('Duty storage is unavailable');
			return deleteManyByIds(table, orgId, ids);
		});

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.families).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'assignment-types', deletedCount: 1 })])
		);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['group-type', 'person-type']);
		await expect(ports.store.findMany('assignment_types', 'org-2')).resolves.toEqual([
			expect.objectContaining({ id: 'foreign-type' })
		]);
		const savedAssignments = await ports.store.findMany('daily_assignments', 'org-1');
		expect(savedAssignments).toHaveLength(2);
		expect(savedAssignments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'saved-person-assignment',
					assignment_type_id: 'person-type',
					date: '2025-01-02',
					assignee_id: 'person-1'
				}),
				expect.objectContaining({
					id: 'saved-group-assignment',
					assignment_type_id: 'group-type',
					date: '2025-01-03',
					assignee_id: 'group-1'
				})
			])
		);
	});

	it('does not delete an archived assignment type when Calendar references cannot be checked', async () => {
		const ports = buildPorts();
		ports.store.seed('assignment_types', [
			{ id: 'possibly-referenced', organization_id: 'org-1', archived_at: isoMonthsAgo(13) }
		]);
		const findMany = ports.store.findMany.bind(ports.store);
		vi.spyOn(ports.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table === 'daily_assignments') throw new Error('Calendar reference check unavailable');
			return findMany(table, orgId, filters, options);
		});

		await expect(cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW })).rejects.toThrow(
			'Calendar reference check unavailable'
		);
		await expect(idsFor(ports, 'assignment_types')).resolves.toEqual(['possibly-referenced']);
	});

	it('skips archived critical tasks that still have completion history', async () => {
		const ports = buildPorts();
		const expired = isoMonthsAgo(13);
		ports.store.seed('ict_tasks', [
			{ id: 'task-referenced', organization_id: 'org-1', archived_at: expired },
			{ id: 'task-unreferenced', organization_id: 'org-1', archived_at: expired }
		]);
		ports.store.seed('personnel_ict_completions', [
			{ id: 'completion-1', organization_id: 'org-1', ict_task_id: 'task-referenced' }
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.families).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'critical-tasks', deletedCount: 1 })])
		);
		await expect(idsFor(ports, 'ict_tasks')).resolves.toEqual(['task-referenced']);
	});

	it('defaults invalid retention settings instead of deleting immediately', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{ id: 'old-but-inside-default', organization_id: 'org-1', archived_at: isoMonthsAgo(13) }
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 0 }], { now: NOW });

		expect(result.deletedCount).toBe(0);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['old-but-inside-default']);
	});

	it('clamps month-end cutoffs instead of rolling into the current month', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{ id: 'expired-before-cutoff', organization_id: 'org-1', archived_at: '2026-02-28T11:59:59.999Z' },
			{ id: 'retained-at-cutoff', organization_id: 'org-1', archived_at: '2026-02-28T12:00:00.000Z' },
			{ id: 'retained-after-cutoff', organization_id: 'org-1', archived_at: '2026-03-01T00:00:00.000Z' }
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 1 }], {
			now: new Date('2026-03-31T12:00:00.000Z')
		});

		expect(result.deletedCount).toBe(1);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['retained-after-cutoff', 'retained-at-cutoff']);
	});

	it('respects per-Organization retention settings', async () => {
		const ports = buildPorts();
		const eightMonthsAgo = isoMonthsAgo(8);
		ports.store.seed('ict_tasks', [
			{ id: 'org-1-task', organization_id: 'org-1', archived_at: eightMonthsAgo },
			{ id: 'org-2-task', organization_id: 'org-2', archived_at: eightMonthsAgo }
		]);

		const result = await cleanupArchivedRecords(
			ports,
			[
				{ id: 'org-1', retentionMonths: 12 },
				{ id: 'org-2', retentionMonths: 6 }
			],
			{ now: NOW }
		);

		expect(result.deletedCount).toBe(1);
		await expect(ports.store.findMany('ict_tasks', 'org-1')).resolves.toHaveLength(1);
		await expect(ports.store.findMany('ict_tasks', 'org-2')).resolves.toHaveLength(0);
	});

	it('defaults missing archive_retention_months to 36 months', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{
				id: 'expired-default',
				organization_id: 'org-1',
				archived_at: isoMonthsAgo(DEFAULT_ARCHIVE_RETENTION_MONTHS + 1)
			},
			{
				id: 'recent-default',
				organization_id: 'org-1',
				archived_at: isoMonthsAgo(DEFAULT_ARCHIVE_RETENTION_MONTHS - 1)
			}
		]);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: null }], { now: NOW });

		expect(result.deletedCount).toBe(1);
		await expect(idsFor(ports, 'personnel')).resolves.toEqual(['recent-default']);
	});

	it('notifies organization admins with summary counts and no record-name payload', async () => {
		const ports = buildPorts();
		seedRetentionRows(ports);

		await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(ports.notifications.notifyAdmins).toHaveBeenCalledExactlyOnceWith(
			'org-1',
			null,
			expect.objectContaining({ type: 'archive_auto_deleted' })
		);
		const payload = ports.notifications.notifyAdmins.mock.calls[0][2];
		expect(payload.message).toContain('Personnel documents: 1');
		expect(payload.message).not.toContain('Smith');
	});

	it('does not mark an organization affected or notify admins when deletes remove no rows', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{ id: 'person-expired', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00.000Z' }
		]);
		vi.spyOn(ports.store, 'deleteManyByIds').mockResolvedValue(0);

		const result = await cleanupArchivedRecords(ports, [{ id: 'org-1', retentionMonths: 12 }], { now: NOW });

		expect(result.deletedCount).toBe(0);
		expect(result.orgsAffected).toBe(0);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('fails on required notification delivery after deletion and leaves the next Organization untouched', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel', [
			{ id: 'org-1-expired', organization_id: 'org-1', archived_at: isoMonthsAgo(13) },
			{ id: 'org-2-expired', organization_id: 'org-2', archived_at: isoMonthsAgo(13) }
		]);
		ports.notifications.notifyAdmins.mockRejectedValue(new Error('administrator lookup unavailable'));

		await expect(
			cleanupArchivedRecords(
				ports,
				[
					{ id: 'org-1', retentionMonths: 12 },
					{ id: 'org-2', retentionMonths: 12 }
				],
				{ now: NOW }
			)
		).rejects.toThrow('administrator lookup unavailable');

		await expect(idsFor(ports, 'personnel')).resolves.toEqual([]);
		await expect(ports.store.findMany('personnel', 'org-2')).resolves.toEqual([
			expect.objectContaining({ id: 'org-2-expired' })
		]);
	});
});
